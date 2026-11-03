"""Заглушка numpy.random: Smart App Control блокирует _mt19937/_generator.pyd.
Импортировать ДО numpy:  import nprand_shim"""
import sys, types, random as _py
stub = types.ModuleType('numpy.random')
sys.modules['numpy.random'] = stub
import numpy as _np
_np.random = stub
def _arr(shape, fn):
    if shape is None or shape == (): return fn()
    n = int(_np.prod(shape)); return _np.array([fn() for _ in range(n)]).reshape(shape)
def seed(s=None): _py.seed(s)
def rand(*shape): return _arr(shape or None, _py.random)
def random(size=None): return _arr(size if size is None or isinstance(size, tuple) else (size,), _py.random)
def randn(*shape): return _arr(shape or None, _py.gauss) if shape else _py.gauss(0,1)
def normal(loc=0.0, scale=1.0, size=None): return _arr(size if size is None or isinstance(size, tuple) else (size,), lambda: _py.gauss(loc, scale))
def uniform(low=0.0, high=1.0, size=None): return _arr(size if size is None or isinstance(size, tuple) else (size,), lambda: _py.uniform(low, high))
def randint(low, high=None, size=None, dtype=int):
    if high is None: low, high = 0, low
    return _arr(size if size is None or isinstance(size, tuple) else (size,), lambda: _py.randrange(low, high))
def permutation(x):
    idx = list(range(x)) if isinstance(x, int) else list(range(len(x))); _py.shuffle(idx)
    return _np.array(idx) if isinstance(x, int) else _np.asarray(x)[idx]
def shuffle(x): _py.shuffle(x)
def choice(a, size=None, replace=True, p=None):
    pool = list(range(a)) if isinstance(a, int) else list(a)
    if size is None: return _py.choice(pool)
    n = int(_np.prod(size)); out = _py.choices(pool, k=n) if replace else _py.sample(pool, n)
    return _np.array(out).reshape(size)
class RandomState:
    def __init__(self, seed=None): self._r = _py.Random(seed)
    def rand(self, *shape): return _arr(shape or None, self._r.random)
    def randn(self, *shape): return _arr(shape or None, lambda: self._r.gauss(0,1))
    def randint(self, low, high=None, size=None, dtype=int):
        if high is None: low, high = 0, low
        return _arr(size if size is None or isinstance(size, tuple) else (size,), lambda: self._r.randrange(low, high))
    def uniform(self, low=0.0, high=1.0, size=None): return _arr(size if size is None or isinstance(size, tuple) else (size,), lambda: self._r.uniform(low, high))
    def normal(self, loc=0.0, scale=1.0, size=None): return _arr(size if size is None or isinstance(size, tuple) else (size,), lambda: self._r.gauss(loc, scale))
    def permutation(self, x):
        idx = list(range(x)) if isinstance(x, int) else list(range(len(x))); self._r.shuffle(idx)
        return _np.array(idx) if isinstance(x, int) else _np.asarray(x)[idx]
    def choice(self, a, size=None, replace=True, p=None):
        pool = list(range(a)) if isinstance(a, int) else list(a)
        if size is None: return self._r.choice(pool)
        n = int(_np.prod(size)); out = self._r.choices(pool, k=n) if replace else self._r.sample(pool, n)
        return _np.array(out).reshape(size)
    def shuffle(self, x): self._r.shuffle(x)
    def seed(self, s=None): self._r.seed(s)
class Generator(RandomState):
    def random(self, size=None): return _arr(size if size is None or isinstance(size, tuple) else (size,), self._r.random)
    def integers(self, low, high=None, size=None, dtype=int): return self.randint(low, high, size)
def default_rng(seed=None): return Generator(seed)
for _n in ('seed','rand','random','randn','normal','uniform','randint','permutation','shuffle','choice','RandomState','Generator','default_rng'):
    setattr(stub, _n, globals()[_n])
stub.random_sample = random; stub.mtrand = stub
