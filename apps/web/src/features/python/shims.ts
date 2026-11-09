/** Pure-Python shim modules written into the Pyodide filesystem. They talk to the bench through `_benchgpio`. */

const EVENTS = `
import _benchgpio as _g

_watchers = []

class _Watch:
    def __init__(self, bcm, edge, callback):
        self.bcm, self.edge, self.callback = bcm, edge, callback
        self.last = _g.read(bcm)
        self.hit = False

def watch(bcm, edge, callback=None):
    w = _Watch(bcm, edge, callback)
    _watchers.append(w)
    return w

def unwatch(w):
    if w in _watchers:
        _watchers.remove(w)

def poll():
    for w in list(_watchers):
        v = _g.read(w.bcm)
        if v == w.last:
            continue
        w.last = v
        if w.edge == 'both' or (w.edge == 'rising' and v == 1) or (w.edge == 'falling' and v == 0):
            w.hit = True
            if w.callback:
                w.callback(w)

def sleep(seconds):
    end = _g.now() + max(0.0, float(seconds)) * 1000.0
    while True:
        poll()
        left = end - _g.now()
        if left <= 0:
            return
        _g.wait(min(left, 10.0))

def pause():
    while True:
        sleep(3600)
`;

const GPIOZERO = `
import _benchgpio as _g
import _bench_events as _ev
from signal import pause

_BOARD = dict(_g.board_map())

def _pin(p):
    if isinstance(p, str):
        s = p.upper()
        if s.startswith('GPIO'):
            return int(s[4:])
        if s.startswith('BOARD'):
            return _BOARD[int(s[5:])]
        if s.startswith('BCM'):
            return int(s[3:])
        return int(s)
    if not 0 <= int(p) <= 27:
        raise ValueError('GPIO%s is not on the Raspberry Pi header (use 0..27)' % p)
    return int(p)

class GPIOZeroError(Exception):
    pass

class Device:
    def __init__(self, pin):
        self.pin = _pin(pin)
        self.closed = False
    def close(self):
        if not self.closed:
            _g.setup(self.pin, 0, 0)
            self.closed = True
    def __enter__(self):
        return self
    def __exit__(self, *a):
        self.close()
    def __repr__(self):
        return '<gpiozero.%s object on pin GPIO%d>' % (type(self).__name__, self.pin)

class OutputDevice(Device):
    def __init__(self, pin, active_high=True, initial_value=False):
        super().__init__(pin)
        self.active_high = active_high
        _g.setup(self.pin, 1, 0)
        self.value = initial_value
    @property
    def value(self):
        return self._value
    @value.setter
    def value(self, v):
        _g.nopwm(self.pin)
        self._value = 1 if v else 0
        _g.write(self.pin, self._value if self.active_high else 1 - self._value)
    @property
    def is_active(self):
        return bool(self._value)
    def on(self):
        self.value = 1
    def off(self):
        self.value = 0
    def toggle(self):
        self.value = 0 if self._value else 1
    def blink(self, on_time=1, off_time=1, n=None, background=True):
        period = float(on_time) + float(off_time)
        _g.pwm(self.pin, 1.0 / period, float(on_time) / period if self.active_high else float(off_time) / period)
        self._value = 1
        if n is not None and not background:
            _ev.sleep(period * n)
            self.off()

class DigitalOutputDevice(OutputDevice):
    pass

class LED(DigitalOutputDevice):
    @property
    def is_lit(self):
        return self.is_active

class Buzzer(DigitalOutputDevice):
    def beep(self, on_time=1, off_time=1, n=None, background=True):
        self.blink(on_time, off_time, n, background)

class PWMOutputDevice(Device):
    def __init__(self, pin, active_high=True, initial_value=0, frequency=100):
        super().__init__(pin)
        self.active_high = active_high
        self.frequency = frequency
        _g.setup(self.pin, 1, 0)
        self.value = initial_value
    @property
    def value(self):
        return self._value
    @value.setter
    def value(self, v):
        v = max(0.0, min(1.0, float(v)))
        self._value = v
        _g.pwm(self.pin, self.frequency, v if self.active_high else 1 - v)
    @property
    def is_active(self):
        return self._value > 0
    def on(self):
        self.value = 1
    def off(self):
        self.value = 0
    def toggle(self):
        self.value = 1 - self._value
    def blink(self, on_time=1, off_time=1, fade_in_time=0, fade_out_time=0, n=None, background=True):
        period = float(on_time) + float(off_time) + float(fade_in_time) + float(fade_out_time)
        _g.pwm(self.pin, 1.0 / period, (float(on_time) + (float(fade_in_time) + float(fade_out_time)) / 2) / period)
    def pulse(self, fade_in_time=1, fade_out_time=1, n=None, background=True):
        self.value = 0.5

class PWMLED(PWMOutputDevice):
    @property
    def is_lit(self):
        return self.is_active

class DigitalInputDevice(Device):
    def __init__(self, pin, pull_up=False, active_state=None, bounce_time=None):
        super().__init__(pin)
        self.pull_up = pull_up
        _g.setup(self.pin, 0, 1 if pull_up else (2 if pull_up is False else 0))
        self._active_low = pull_up if active_state is None else not active_state
        self._when_on = None
        self._when_off = None
        self._watch = None
    @property
    def value(self):
        v = _g.read(self.pin)
        return 1 - v if self._active_low else v
    @property
    def is_active(self):
        return bool(self.value)
    def _cb(self, w):
        active = self.value == 1
        fn = self._when_on if active else self._when_off
        if fn:
            try:
                fn(self)
            except TypeError:
                fn()
    def _rewatch(self):
        if self._watch:
            _ev.unwatch(self._watch)
            self._watch = None
        if self._when_on or self._when_off:
            self._watch = _ev.watch(self.pin, 'both', self._cb)
    @property
    def when_activated(self):
        return self._when_on
    @when_activated.setter
    def when_activated(self, fn):
        self._when_on = fn
        self._rewatch()
    @property
    def when_deactivated(self):
        return self._when_off
    @when_deactivated.setter
    def when_deactivated(self, fn):
        self._when_off = fn
        self._rewatch()
    def wait_for_active(self, timeout=None):
        return self._wait(1, timeout)
    def wait_for_inactive(self, timeout=None):
        return self._wait(0, timeout)
    def _wait(self, want, timeout):
        start = _g.now()
        while self.value != want:
            if timeout is not None and _g.now() - start > timeout * 1000:
                return False
            _ev.sleep(0.01)
        return True

class Button(DigitalInputDevice):
    def __init__(self, pin, pull_up=True, active_state=None, bounce_time=None, hold_time=1, hold_repeat=False):
        super().__init__(pin, pull_up=pull_up, active_state=active_state, bounce_time=bounce_time)
    is_pressed = property(lambda self: self.is_active)
    when_pressed = DigitalInputDevice.when_activated
    when_released = DigitalInputDevice.when_deactivated
    def wait_for_press(self, timeout=None):
        return self.wait_for_active(timeout)
    def wait_for_release(self, timeout=None):
        return self.wait_for_inactive(timeout)

class MotionSensor(DigitalInputDevice):
    motion_detected = property(lambda self: self.is_active)
    when_motion = DigitalInputDevice.when_activated
    when_no_motion = DigitalInputDevice.when_deactivated
    def wait_for_motion(self, timeout=None):
        return self.wait_for_active(timeout)

InputDevice = DigitalInputDevice
`;

const RPI_GPIO = `
import _benchgpio as _g
import _bench_events as _ev

BCM, BOARD = 11, 10
OUT, IN = 0, 1
HIGH, LOW = 1, 0
PUD_OFF, PUD_DOWN, PUD_UP = 20, 21, 22
RISING, FALLING, BOTH = 31, 32, 33
VERSION = '0.7.1 (Electronics Bench)'
RPI_INFO = {'P1_REVISION': 3, 'TYPE': 'Pi 4 Model B', 'RAM': '4G'}

_mode = None
_warn = True
_BOARD = dict(_g.board_map())
_events = {}

def setmode(mode):
    global _mode
    if mode not in (BCM, BOARD):
        raise ValueError('An invalid mode was passed to setmode()')
    _mode = mode

def getmode():
    return _mode

def setwarnings(flag):
    global _warn
    _warn = bool(flag)

def _bcm(ch):
    if _mode is None:
        raise RuntimeError('Please set pin numbering mode using GPIO.setmode(GPIO.BOARD) or GPIO.setmode(GPIO.BCM)')
    if _mode == BOARD:
        if ch not in _BOARD:
            raise ValueError('The channel sent is invalid on a Raspberry Pi (BOARD pin %s is not a GPIO)' % ch)
        return _BOARD[ch]
    if not 0 <= ch <= 27:
        raise ValueError('The channel sent is invalid on a Raspberry Pi')
    return ch

def _each(ch):
    return list(ch) if isinstance(ch, (list, tuple)) else [ch]

def setup(channel, direction, pull_up_down=PUD_OFF, initial=None):
    for c in _each(channel):
        b = _bcm(c)
        if direction == OUT:
            _g.setup(b, 1, 0)
            _g.write(b, 1 if initial else 0)
        else:
            _g.setup(b, 0, {PUD_UP: 1, PUD_DOWN: 2}.get(pull_up_down, 0))

def output(channel, value):
    chans, vals = _each(channel), _each(value)
    if len(vals) == 1:
        vals = vals * len(chans)
    for c, v in zip(chans, vals):
        b = _bcm(c)
        if not _g.is_output(b):
            raise RuntimeError('The GPIO channel has not been set up as an OUTPUT')
        _g.nopwm(b)
        _g.write(b, 1 if v else 0)

def input(channel):
    return _g.read(_bcm(channel))

def cleanup(channel=None):
    chans = _each(channel) if channel is not None else range(28)
    for c in chans:
        b = c if channel is None else _bcm(c)
        _g.setup(b, 0, 0)
    for w in list(_events.values()):
        _ev.unwatch(w)
    _events.clear()

def gpio_function(channel):
    return OUT if _g.is_output(_bcm(channel)) else IN

class PWM:
    def __init__(self, channel, frequency):
        self.pin = _bcm(channel)
        self.freq = float(frequency)
        self.dc = 0.0
    def start(self, dutycycle):
        self.dc = float(dutycycle)
        _g.setup(self.pin, 1, 0)
        _g.pwm(self.pin, self.freq, self.dc / 100.0)
    def ChangeDutyCycle(self, dutycycle):
        self.dc = float(dutycycle)
        _g.pwm(self.pin, self.freq, self.dc / 100.0)
    def ChangeFrequency(self, frequency):
        self.freq = float(frequency)
        _g.pwm(self.pin, self.freq, self.dc / 100.0)
    def stop(self):
        _g.nopwm(self.pin)
        _g.write(self.pin, 0)

_EDGE = {RISING: 'rising', FALLING: 'falling', BOTH: 'both'}

def add_event_detect(channel, edge, callback=None, bouncetime=None):
    b = _bcm(channel)
    if b in _events:
        raise RuntimeError('Conflicting edge detection already enabled for this GPIO channel')
    _events[b] = _ev.watch(b, _EDGE[edge], (lambda w, ch=channel: callback(ch)) if callback else None)

def add_event_callback(channel, callback):
    w = _events[_bcm(channel)]
    old = w.callback
    w.callback = lambda ww, ch=channel: (old and old(ww), callback(ch))

def remove_event_detect(channel):
    w = _events.pop(_bcm(channel), None)
    if w:
        _ev.unwatch(w)

def event_detected(channel):
    _ev.poll()
    w = _events.get(_bcm(channel))
    if w and w.hit:
        w.hit = False
        return True
    return False

def wait_for_edge(channel, edge, bouncetime=None, timeout=None):
    b = _bcm(channel)
    w = _ev.watch(b, _EDGE[edge])
    start = _g.now()
    try:
        while not w.hit:
            if timeout is not None and _g.now() - start > timeout:
                return None
            _ev.sleep(0.005)
        return channel
    finally:
        _ev.unwatch(w)
`;

const BOOT = `
import time, signal, _bench_events
time.sleep = _bench_events.sleep
signal.pause = _bench_events.pause
`;

export const PY_FILES: [string, string][] = [
  ['_bench_events.py', EVENTS],
  ['gpiozero/__init__.py', GPIOZERO],
  ['RPi/__init__.py', ''],
  ['RPi/GPIO.py', RPI_GPIO],
];

export const PY_BOOT = BOOT;
