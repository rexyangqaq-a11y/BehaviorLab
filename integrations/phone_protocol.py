"""Local validation only; preserve native parsing and never infer coordinate units."""
import ast
import math

COORDINATE_CONTRACT = {
    'space': 'normalized_1000', 'range': [0, 1000],
    'conversion': 'native_framework_once', 'physical_validation': 'observed_screen_pixels',
    'automatic_unit_guessing': False,
}

def with_coordinate_contract(messages, framework):
    result = [dict(message) for message in messages]
    description = ('element/start/end点' if framework == 'autoglm' else 'bbox边界和start_coords/end_coords')
    instruction = ('\n[BehaviorLab coordinate contract] ' + description +
                   '使用0–1000归一化坐标，不是截图像素或原屏像素。只由原生框架转换一次；'
                   '不要混用单位。超出范围时停止说明，不猜测缩放。')
    for message in result:
        if message.get('role') == 'system' and isinstance(message.get('content'), str):
            if '[BehaviorLab coordinate contract]' not in message['content']:
                message['content'] += instruction
            return result
    return [{'role': 'system', 'content': instruction.strip()}, *result]

def validate_autoglm_action(text, native_parse):
    """Reject native fallback-to-finish before PhoneAgent sees a malformed action."""
    try:
        call = ast.parse(text.strip(), mode='eval').body
        if not isinstance(call, ast.Call) or not isinstance(call.func, ast.Name) or call.func.id not in ('do', 'finish') or call.args:
            raise ValueError('expected one explicit do()/finish()')
        if any(k.arg is None for k in call.keywords) or len({k.arg for k in call.keywords}) != len(call.keywords):
            raise ValueError('duplicate/expanded keyword')
        values = {k.arg: ast.literal_eval(k.value) for k in call.keywords}
        if call.func.id == 'finish':
            if set(values) != {'message'} or not isinstance(values['message'], str) or not values['message'].strip():
                raise ValueError('finish requires an explicit message')
        elif not isinstance(values.get('action'), str) or not values['action'].strip():
            raise ValueError('do requires an action')
        for key in ('element', 'start', 'end'):
            if key in values:
                point = values[key]
                if not isinstance(point, (list, tuple)) or len(point) != 2 or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or not 0 <= v <= 1000 for v in point):
                    raise ValueError('invalid normalized coordinates')
        result = native_parse(text.strip())
        if result.get('_metadata') != call.func.id:
            raise ValueError('native action kind differs')
        return result
    except (SyntaxError, TypeError, ValueError) as error:
        raise ValueError('Action protocol invalid; no fallback finish: ' + str(error)) from error
