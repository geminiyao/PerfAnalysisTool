"""Build v4 structured extensions from a loaded profile."""

from .thread_tagger import tag_all_threads
from .playerloop_phases import compute_playerloop_stages
from .business_modules import compute_business_modules
from .call_up_tracer import compute_call_up_tracing
from .probes import compute_probes
from .main_thread_tree import compute_main_thread_tree


def build_v4_extensions(profile, profile_dict, base_ctx=None):
    """
    Return v4 extension dict to merge into detail.simpleperf.
    base_ctx: optional (profile, tagged_threads, grand_total_ec, total_samples) for main thread tree diff markers.
    """
    grand_total_ec = 0
    for _p, th in profile.iter_threads():
        grand_total_ec += th["event_count"]
    grand_total_ec = grand_total_ec or 1

    total_samples = profile.total_samples
    metrics = profile_dict["core"]["metrics"]

    tagged = tag_all_threads(profile, grand_total_ec)
    stages = compute_playerloop_stages(profile, grand_total_ec, tagged)
    modules = compute_business_modules(profile, grand_total_ec, tagged, metrics, total_samples)
    tracing = compute_call_up_tracing(profile, grand_total_ec, tagged)
    probe_list = compute_probes(profile, grand_total_ec, tagged, modules, stages, total_samples)

    base_for_tree = None
    if base_ctx:
        base_for_tree = (base_ctx[0], base_ctx[1], base_ctx[2], base_ctx[3])

    main_tree = compute_main_thread_tree(
        profile, grand_total_ec, tagged, total_samples, base_for_tree,
    )

    return {
        "totalSamples": total_samples,
        "metrics": metrics,
        "threads": tagged,
        "playerLoopStages": stages,
        "businessModules": modules,
        "callUpTracing": tracing,
        "probes": probe_list,
        "mainThreadTree": main_tree,
    }
