import com.huawei.hosscrcpy.api.HosRemoteConfig;
import com.huawei.hosscrcpy.api.HosRemoteDevice;
import com.huawei.hosscrcpy.api.ScreenCapCallback;
import java.io.*;
import java.nio.ByteBuffer;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** Binary video on stdout; SDK diagnostics only on stderr. No input injection. */
public final class PhoneVideoBridge {
    private static final AtomicBoolean closed = new AtomicBoolean();
    private static volatile long lastFrame;
    private static volatile boolean ready;
    private static HosRemoteDevice device;
    private static void status(String value) {
        System.err.println("BEHAVIORLAB_VIDEO:" + value);
        System.err.flush();
    }
    private static void stop() {
        if (!closed.compareAndSet(false, true)) return;
        try { if (device != null) device.stopCaptureScreen(); }
        catch (Throwable error) { status("stop_error:" + error.getClass().getSimpleName()); }
    }
    public static void main(String[] args) throws Exception {
        DataOutputStream video = new DataOutputStream(new FileOutputStream(FileDescriptor.out));
        System.setOut(System.err);
        BufferedReader input = new BufferedReader(new InputStreamReader(System.in, "UTF-8"));
        String serial = input.readLine(), hdc = input.readLine();
        int port = Integer.parseInt(input.readLine());
        if (serial == null || hdc == null || port < 1024 || port > 65535) throw new IllegalArgumentException("video configuration");
        HosRemoteConfig config = new HosRemoteConfig(serial);
        config.setHdcPath(hdc);
        // The packaged extension produced no frames on this API26 phone.
        // The system extension is the explicitly tested configuration.
        config.setForceUseMobileSo(true);
        config.setScale(2);
        config.setFrameRate(15);
        config.setBitRate(4);
        config.setPort(port);
        config.setIFrameInterval(1000);
        config.setRepeatInterval(67);
        Runtime.getRuntime().addShutdownHook(new Thread(PhoneVideoBridge::stop));
        device = new HosRemoteDevice(config);
        device.startCaptureScreen(new ScreenCapCallback() {
            public void onData(ByteBuffer buffer) {
                if (closed.get()) return;
                try {
                    ByteBuffer source = buffer.duplicate();
                    int size = source.remaining();
                    if (size <= 0 || size > 8 * 1024 * 1024) throw new IOException("video packet size");
                    byte[] frame = new byte[size]; source.get(frame);
                    synchronized (video) { video.writeInt(size); video.write(frame); video.flush(); }
                    lastFrame = System.currentTimeMillis();
                } catch (Exception error) { status("error:" + error.getClass().getSimpleName()); }
            }
            public void onException(Throwable error) { status("error:" + error.getClass().getSimpleName()); }
            public void onReady() { ready = true; status("ready"); }
        });
        ScheduledExecutorService keyframes = Executors.newSingleThreadScheduledExecutor(task -> {
            Thread thread = new Thread(task, "video-keyframe"); thread.setDaemon(true); return thread;
        });
        keyframes.scheduleWithFixedDelay(() -> {
            if (ready && !closed.get() && System.currentTimeMillis() - lastFrame > 1500) {
                try { device.requestIDRFrame(); } catch (Throwable ignored) { }
            }
        }, 1, 1, TimeUnit.SECONDS);
        try {
            String command;
            while ((command = input.readLine()) != null) {
                if ("stop".equals(command)) break;
                if ("idr".equals(command) && ready) device.requestIDRFrame();
            }
        } finally { keyframes.shutdownNow(); stop(); }
        status("stopped");
        System.exit(0);
    }
}
