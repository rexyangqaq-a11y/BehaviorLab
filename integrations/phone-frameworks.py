"""Native Python framework loops with instrumented model/device I/O.

No model key enters this process. JSON RPC goes to the local Node worker, which
enforces the shared request budget and retains actual provider responses.
"""
import sys, json, os, io, base64, types, pathlib, traceback, itertools
from PIL import Image
# Node's JSON-lines wire is UTF-8 even on Windows machines whose console code
# page is GBK. Decoding it with the locale can corrupt valid provider JSON.
for stream in (sys.stdin, sys.stdout, sys.stderr):
    stream.reconfigure(encoding='utf-8', errors='strict')
WIRE = sys.stdout
sys.stdout = sys.stderr
config = json.loads(sys.stdin.readline())
root = pathlib.Path(config['project'])
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from phone_protocol import COORDINATE_CONTRACT, with_coordinate_contract, validate_autoglm_action
counter = 0
def rpc(method, **args):
    global counter
    counter += 1
    WIRE.write('@PHONE_RPC@' + json.dumps({'id': counter, 'method': method, 'args': args}, ensure_ascii=False) + '\n')
    WIRE.flush()
    response = json.loads(sys.stdin.readline())
    if response.get('error'): raise RuntimeError(response['error'])
    return response.get('result')
def model_response(messages, **extra):
    if extra.get('max_tokens') is None: extra.pop('max_tokens', None)
    return rpc('model', body={'model': config['model'], 'messages': with_coordinate_contract(messages, config['framework']), 'stream': False, **extra})
def shot(): return rpc('capture')
def reduced(data, fmt='JPEG'):
    img=Image.open(io.BytesIO(base64.b64decode(data)))
    img=img.resize((img.width//2,img.height//2),Image.Resampling.LANCZOS)
    buf=io.BytesIO();img.save(buf,format=fmt)
    return base64.b64encode(buf.getvalue()).decode()
def action(name, **params): return rpc('action',name=name,param=params)

def run_autoglm():
    sys.path.insert(0,str(root/'.runtime/frameworks/Open-AutoGLM'))
    from phone_agent.agent import PhoneAgent,AgentConfig
    from phone_agent.model.client import ModelClient,ModelConfig,ModelResponse
    import phone_agent.device_factory as factory
    def request(self,messages):
        # Native MessageBuilder labels screenshots PNG. This local bridge uses
        # JPEG at the same half resolution to fit the existing 2 MiB ceiling.
        # Correct only the MIME label of our JPEG bytes, before retaining input.
        for message in messages:
            if not isinstance(message.get('content'),list): continue
            for item in message['content']:
                url=item.get('image_url',{}).get('url','')
                if url.startswith('data:image/png;base64,/9j/'):
                    item['image_url']['url']=url.replace('data:image/png;','data:image/jpeg;',1)
        raw=model_response(messages,max_tokens=config['max_output_tokens'],temperature=0,enable_thinking=False)
        content=raw['choices'][0]['message'].get('content')
        if not content: raise ValueError('Empty model content')
        # The pinned native client checks do()/finish() before its legacy XML
        # branch, leaving </answer> on otherwise valid actions. Only remove the
        # declared wrapper; keep native action parsing and raw evidence intact.
        normalized=content.replace('<answer>','').replace('</answer>','')
        thinking,parsed=self._parse_response(normalized)
        from phone_agent.actions.handler import parse_action
        try:
            validated = validate_autoglm_action(parsed, parse_action)
        except ValueError as error:
            rpc('protocol_rejected', reason=str(error), coordinate_contract=COORDINATE_CONTRACT)
            raise
        rpc('protocol_validated', action=validated, coordinate_contract=COORDINATE_CONTRACT)
        rpc('parsed',action=parsed,thinking=thinking,response_normalization='answer_wrapper_removed' if normalized!=content else None)
        return ModelResponse(thinking=thinking,action=parsed,raw_content=content)
    ModelClient.request=request
    class Bridge:
        device_type=factory.DeviceType.HDC
        def get_screenshot(self,*a,**k):
            s=shot();return types.SimpleNamespace(base64_data=reduced(s['base64'],'JPEG'),width=s['width'],height=s['height'])
        def get_current_app(self,*a,**k): return rpc('current_app')
        def tap(self,x,y,*a,**k): return action('tap',x=x,y=y)
        def double_tap(self,x,y,*a,**k): return action('doubleTap',x=x,y=y)
        def long_press(self,x,y,*a,**k): return action('longPress',x=x,y=y)
        def swipe(self,x,y,ex,ey,*a,**k): return action('swipe',x=x,y=y,ex=ex,ey=ey)
        def back(self,*a,**k): return action('back')
        def home(self,*a,**k): return action('home')
        def launch_app(self,app,*a,**k): action('launch',app=app);return True
        def detect_and_set_adb_keyboard(self,*a,**k): return None
        def restore_keyboard(self,*a,**k): return None
        def clear_text(self,*a,**k): return action('clear')
        def type_text(self,text,*a,**k): return action('input',text=text)
    factory._device_factory=Bridge()
    agent=PhoneAgent(ModelConfig(base_url='http://127.0.0.1:9/unused',api_key='local-rpc-no-provider-key',model_name=config['model'],max_tokens=config['max_output_tokens']),
        AgentConfig(max_steps=config.get('max_steps',config['max_actions']) or float('inf'),verbose=False),confirmation_callback=lambda message:False,
        takeover_callback=lambda message:(_ for _ in ()).throw(RuntimeError('Manual takeover required: '+message)))
    # This helper otherwise bypasses the device factory for Enter; route it too.
    agent.action_handler._send_keyevent=lambda key: action('enter') if key in ('66','KEYCODE_ENTER') else (_ for _ in ()).throw(RuntimeError('Unsupported key'))
    last=None;steps=0
    limit=config.get('max_steps',config['max_actions'])
    for step in itertools.count():
        if limit is not None and step>=limit: break
        result=agent.step(config['task'] if step==0 else None)
        item={'success':result.success,'finished':result.finished,'action':result.action,'message':result.message}
        last=item;steps+=1;rpc('framework_step',result=item)
        if not result.success or result.finished:break
    return {'native_result':last,'native_steps':steps}

def run_mobiagent():
    source_root=root/'.runtime/frameworks/MobiAgent'
    sys.path.insert(0,str(source_root))
    # Optional retrieval has heavy embedding dependencies. This variant disables
    # experience/memory and removes only its eager import, not planning/parsing.
    source_file=source_root/'runner/mobiagent/mobiagent.py'
    source=source_file.read_text(encoding='utf-8')
    eager='from utils.local_experience import PromptTemplateSearch '
    if eager not in source:raise RuntimeError('Pinned MobiAgent import seam changed')
    module=types.ModuleType('runner.mobiagent.mobiagent')
    module.__file__=str(source_file);module.__package__='runner.mobiagent'
    sys.modules[module.__name__]=module
    exec(compile(source.replace(eager,'# Optional retrieval disabled by local adapter'),str(source_file),'exec'),module.__dict__)
    module.MAX_STEPS=config.get('max_steps',config['max_actions']) or float('inf');module.MAX_RETRIES=1 # upstream counts attempts, not retries
    module.API_TIMEOUT=None # Local RPC transport owns request cancellation/deadlines.
    module.DECIDER_MAX_TOKENS=config['max_output_tokens'];module.preference_extractor=None
    class Completions:
        def create(self,**kwargs):
            raw=model_response(kwargs['messages'],max_tokens=config['max_output_tokens'],temperature=0,enable_thinking=False)
            return types.SimpleNamespace(choices=[types.SimpleNamespace(message=types.SimpleNamespace(content=raw['choices'][0]['message']['content']))])
    module.decider_client=types.SimpleNamespace(chat=types.SimpleNamespace(completions=Completions()))
    module.decider_model=config['model']
    module._requests_chat_completion=lambda *a,**k:None
    class Device(module.Device):
        def start_app(self,app): return action('launch',app=app)
        def app_start(self,app): return action('launch',app=app)
        def app_stop(self,app): raise RuntimeError('Native task dispatcher auto-stop disabled')
        def screenshot(self,file):
            s=shot();pathlib.Path(file).write_bytes(base64.b64decode(s['base64']))
        def click(self,x,y): return action('tap',x=x,y=y)
        def input(self,text): return action('input',text=text)
        def swipe(self,direction):
            s=shot();x,y,ex,ey=module.compute_swipe_positions(direction,s['width'],s['height'])
            return action('swipe',x=x,y=y,ex=ex,ey=ey)
        def swipe_with_coords(self,x,y,ex,ey): return action('swipe',x=x,y=y,ex=ex,ey=ey)
        def long_press(self,x,y,duration=1): return action('longPress',x=x,y=y)
        def keyevent(self,key):
            name=getattr(key,'name',str(key)).upper()
            return action('home' if 'HOME' in name or str(key)=='1' else 'back')
        def dump_hierarchy(self): return rpc('layout')
    # Native task_in_app starts at the supplied device state. The outer CLI's
    # app-selection planner/start/stop is intentionally excluded for fair starts.
    module.task_in_app(config['app'],config['task'],config['task'],Device(),config['data_dir'],True,True,'Harmony',True)
    result_file=pathlib.Path(config['data_dir'])/'actions.json'
    return json.loads(result_file.read_text(encoding='utf-8')) if result_file.exists() else {'native_result':'no result file'}

try:
    if config.get('contract_only'):
        if config['framework']=='autoglm':
            sys.path.insert(0,str(root/'.runtime/frameworks/Open-AutoGLM'))
            from phone_agent.actions.handler import parse_action
            parse_action('do(action="Tap", element=[500,500])')
        else:
            sys.path.insert(0,str(root/'.runtime/frameworks/MobiAgent'))
            from runner.mobiagent.decider_adapters import get_decider_adapter
            get_decider_adapter('qwen_json').build_messages('offline',[],'fixture',True,'Harmony')
        result={'contract':'passed','model_requests':0,'device_actions':0}
    else:
        os.makedirs(config['data_dir'],exist_ok=True);os.chdir(config['data_dir'])
        # Native MobiAgent visualization expects this font in its working folder.
        font=root/'.runtime/frameworks/MobiAgent/msyh.ttf'
        if not font.exists():
            # Use the font licensed with this Windows installation. Portable
            # packages deliberately do not redistribute the upstream font.
            font=pathlib.Path(os.environ.get('WINDIR','C:/Windows'))/'Fonts/msyh.ttc'
        if config['framework']=='mobiagent' and font.exists():
            import shutil
            shutil.copyfile(font,pathlib.Path(config['data_dir'])/'msyh.ttf')
        runners={'autoglm':run_autoglm,'mobiagent':run_mobiagent}
        if config['framework'] not in runners:
            raise ValueError('Unknown Python framework: '+config['framework'])
        result=runners[config['framework']]()
    WIRE.write('@PHONE_DONE@'+json.dumps({'result':result},ensure_ascii=False)+'\n');WIRE.flush()
except BaseException as error:
    traceback.print_exc(file=sys.stderr)
    WIRE.write('@PHONE_DONE@'+json.dumps({'error':str(error)},ensure_ascii=False)+'\n');WIRE.flush()
    sys.exit(1)
