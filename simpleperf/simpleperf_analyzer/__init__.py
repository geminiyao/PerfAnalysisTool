"""simpleperf_analyzer - Android native C++ performance analysis toolkit.

A thin, well-tested layer on top of the official NDK simpleperf
``report_html.RecordData`` providing:

  * loader      - load perf.data into a clean Profile object
  * so_compare  - Level 1: per-thread per-so CPU proportion diff
  * anchor_compare - Level 2: anchor-function subtree time diff
  * func_compare   - Level 3: function-level A/M/D diff
  * single_profile - hotspot + thread/so breakdown for one profile
  * regression     - multi-version trend analysis
  * reporter        - JSON / text / CSV formatting
"""

from . import config  # noqa: F401
from .loader import Profile, load_profile  # noqa: F401

__all__ = ["config", "Profile", "load_profile"]
__version__ = "0.1.0"
