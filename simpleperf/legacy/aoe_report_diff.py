# =============================================================================
# LEGACY FILE – archived for reference only
# =============================================================================
# This is the original aoe_report_diff.py that was used as a starting point
# for the simpleperf_analyzer toolkit.
#
# DO NOT use this directly for new work.  Use the toolkit instead:
#   - scripts/compare.py  (A/B comparison, Level 1+2+3)
#   - simpleperf_analyzer/func_compare.py  (fixed Level 3 logic)
#
# Known issues in this file (all fixed in func_compare.py):
#   1. Line 498-507: __main__ block unconditionally calls debugpy.listen() /
#      wait_for_client() – the script blocks at import unless a debugger is
#      attached. Fixed by removing the debugpy block.
#   2. Line 224: "Deleted" detection loop keys on `cur_func_name` (a leftover
#      from the preceding loop) instead of `prev_func_name`, so D-entries are
#      effectively never reported. Fixed by using `prev_func_name`.
#   3. LIB_WHITE_LIST / TARGET_LIB_LIST are hardcoded to
#      `com.tencent.tmaoe-X3WjWodWzsg71IGeo9qnRw==` install paths. Fixed by
#      auto-detecting interesting libs from the perf.data libList via
#      config.DEFAULT_LIB_TOKENS.
#   4. No percentage output, text-only. Fixed with JSON + delta_pct output.
# =============================================================================

import os
import sys
import argparse
import json
import copy

from report_html import RecordData
from utils import log_exit

MAX_CALLSTACK_LENGTH = 750
TIME_THRESHOLD = 5.0

LIB_WHITE_LIST = {
    "/data/app/com.tencent.tmaoe-X3WjWodWzsg71IGeo9qnRw==/lib/arm64/libunity.so",
    "/data/app/com.tencent.tmaoe-X3WjWodWzsg71IGeo9qnRw==/lib/arm64/libil2cpp.so",
    "/data/app/com.tencent.tmaoe-X3WjWodWzsg71IGeo9qnRw==/oat/arm64/base.odex",
    "/data/app/com.tencent.tmaoe-X3WjWodWzsg71IGeo9qnRw==/oat/arm64/base.vdex",
    "/data/app/com.tencent.tmaoe-X3WjWodWzsg71IGeo9qnRw==/lib/arm64/libxlua.so",
    "/data/app/com.tencent.tmaoe-X3WjWodWzsg71IGeo9qnRw==/lib/arm64/lib_burst_generated.so",
}

FUNC_NAME_BLACK_LIST = {
    "gcloud",
    "crashsight"
}

NO_RECORD_FUNC_NAME_LIST = {
    "PlayerLoop",
}

# 特征
THREAD_CHARACTERISTIC_FUNC = [
    "ExecutePlayerLoop",
    "GfxDeviceWorker::RunCommand",
    # "JobQueue::WorkLoop",
    "TranscriptScriptableRenderContext::ExecuteScriptableRenderLoop",
]

TARGET_LIB_LIST = [
    "/data/app/com.tencent.tmaoe-X3WjWodWzsg71IGeo9qnRw==/lib/arm64/libxlua.so",
    "/data/app/com.tencent.tmaoe-X3WjWodWzsg71IGeo9qnRw==/lib/arm64/libunity.so",
    "/data/app/com.tencent.tmaoe-X3WjWodWzsg71IGeo9qnRw==/lib/arm64/lib_burst_generated.so",
    "/data/app/com.tencent.tmaoe-X3WjWodWzsg71IGeo9qnRw==/lib/arm64/libil2cpp.so",
]


def get_thread_graph_info(call_graph, tab_count):
    func_name = call_graph['func_name']

    time_scale = 1000000.0
    # event_count = call_graph['event_count']
    # event_time_str = str(event_count / time_scale)

    subtree_event_count = call_graph['subtree_event_count']
    subtree_event_time_str = str(subtree_event_count / time_scale)

    out_content = tab_count * '\t' + func_name + ' ' + subtree_event_time_str + 'ms\n'

    child_graph = call_graph['child_graph']
    for sub_graph in child_graph:
        child_content = get_thread_graph_info(sub_graph, tab_count + 1)
        out_content += child_content

    return out_content

def compare_node_test(record_tree):
    out_content = ""
    for item in record_tree.items():
        process = item[1]

        for thread_item in process.items():
            thread = thread_item[1]
            if thread['thread_name'] != 'UnityMain':
                continue
            call_graph = thread['call_graph']

            out_content += get_thread_graph_info(call_graph, 0)

    return out_content


def create_func_dict(func_name='', lib_name='', subtree_event_time=0.0, children_dict=None, merge_mask=''):
    func_dict = dict()
    func_dict['func_name'] = func_name
    func_dict['lib_name'] = lib_name
    func_dict['subtree_event_time'] = subtree_event_time
    func_dict['children_dict'] = children_dict or dict()
    func_dict['merge_mask'] = merge_mask
    return func_dict

# 黑名单
def is_has_black_list_key(func_name):
    lower_func_name = func_name.lower()
    for key in FUNC_NAME_BLACK_LIST:
        lower_key = key.lower()
        if lower_func_name.find(lower_key) >= 0:
            return True
    return False

def is_no_record_func(func_name):
    for key in NO_RECORD_FUNC_NAME_LIST:
        if func_name.find(key) >= 0:
            return True
    return False

# 特征值
def get_characteristic_func_index(func_name):
    for i in range(len(THREAD_CHARACTERISTIC_FUNC)):
        key = THREAD_CHARACTERISTIC_FUNC[i]
        index = func_name.find(key)
        if index < 0:
            continue
        return i
    return -1

# 遍历callgraph
def get_thread_func_dict(call_graph, tab_count, ret_dict, lib_id_to_name):
    characteristic_func_index = -1

    func_name = call_graph['func_name']
    if func_name != '':
        characteristic_func_index = get_characteristic_func_index(func_name)

    time_scale = 1000000.0

    subtree_event_count = call_graph['subtree_event_count']
    subtree_event_time = subtree_event_count / time_scale

    # if is_has_black_list_key(func_name) or subtree_event_time < TIME_THRESHOLD:
        # return ret_dict
    if is_has_black_list_key(func_name):
        return characteristic_func_index

    lib_id = call_graph['lib_id']
    lib_name = ''
    if lib_id >= 0:
        lib_name = lib_id_to_name[lib_id]

    # root
    if not is_no_record_func(func_name) and (lib_id < 0 or lib_name in LIB_WHITE_LIST):
        last_func_dict = ret_dict.get(func_name, None)
        if not last_func_dict:
            func_dict = create_func_dict(func_name, lib_name, subtree_event_time)

            if lib_id < 0:
                func_dict['children_dict'] = dict()

            ret_dict[func_name] = func_dict
        else:
            last_func_dict['subtree_event_time'] += subtree_event_time

    # iterate children
    child_graph = call_graph['child_graph']
    for sub_graph in child_graph:
        sub_func_index = -1
        if lib_id < 0:
            children_dict = ret_dict[func_name]['children_dict']
            sub_func_index = get_thread_func_dict(sub_graph, tab_count + 1, children_dict, lib_id_to_name)
        else:
            sub_func_index = get_thread_func_dict(sub_graph, tab_count + 1, ret_dict, lib_id_to_name)
        characteristic_func_index = characteristic_func_index if characteristic_func_index >= 0 else sub_func_index

    # return ret_dict
    return characteristic_func_index

def get_thread_dict_by_record_tree(record_tree, lib_id_to_name):
    thread_dict = dict()

    for item in record_tree.items():
        process = item[1]

        for thread_item in process.items():
            thread = thread_item[1]

            thread_name = thread['thread_name']
            call_graph = thread['call_graph']

            func_dict = dict()
            characteristic_func_index = get_thread_func_dict(call_graph, 0, func_dict, lib_id_to_name)
            if characteristic_func_index < 0:
                continue

            if bool(func_dict) and bool(func_dict[thread_name]['children_dict']):
                func_dict[thread_name]['characteristic_func_index'] = characteristic_func_index
                new_dict = {
                    characteristic_func_index: func_dict[thread_name]   
                }
                thread_dict.update(new_dict)

    return thread_dict

# A:Add, M:Modify, D:Delete
def do_merge_thread_dict(merged_thread_dict, prev_single_thread_dict, cur_single_thread_dict):
    prev_children_dict = prev_single_thread_dict['children_dict']
    cur_children_dict = cur_single_thread_dict['children_dict']

    for child_item in cur_children_dict.items():
        cur_func_name = child_item[0]
        cur_func_dict = child_item[1]

        cur_subtree_event_time = cur_func_dict['subtree_event_time']

        prev_func_dict = prev_children_dict.get(cur_func_name, None)
        if not prev_func_dict:
            # if abs(cur_single_thread_dict) < TIME_THRESHOLD:
                # continue
            merged_thread_dict[cur_func_name] = copy.copy(cur_func_dict)
            merged_thread_dict[cur_func_name]['merge_mask'] = 'A'
        else:
            prev_subtree_event_time = prev_func_dict['subtree_event_time']
            delta_time = cur_subtree_event_time - prev_subtree_event_time
            # if abs(delta_time) < TIME_THRESHOLD:
            #     continue

            merged_thread_dict[cur_func_name] = copy.copy(cur_func_dict)
            merged_thread_dict[cur_func_name]['subtree_event_time'] = delta_time
            merged_thread_dict[cur_func_name]['merge_mask'] = 'M'


    for child_item in prev_children_dict.items():
        prev_func_name = child_item[0]
        prev_func_dict = child_item[1]

        # BUG (line 224 in original): was `merged_thread_dict.get(cur_func_name, None)`
        # which uses the stale cur_func_name from the previous loop, so D entries are
        # effectively never emitted. Fixed version uses prev_func_name (see func_compare.py).
        merged_func_dict = merged_thread_dict.get(cur_func_name, None)  # noqa: F821  # original bug preserved
        if not merged_func_dict:
            # if abs(cur_single_thread_dict) < TIME_THRESHOLD:
            #     continue
            merged_thread_dict[prev_func_name] = copy.copy(prev_func_dict)
            merged_thread_dict[prev_func_name]['merge_mask'] = 'D'

def dump_one_func_dict(func_dict, tab_count=0):
    return tab_count * '\t' + '[' + func_dict['merge_mask'] + '] ' + func_dict['func_name'] + ' ' + str(func_dict['subtree_event_time']) + 'ms\n'

# ===========================
# func_dict['func_name']
# func_dict['lib_name']
# func_dict['subtree_event_time']
# func_dict['children_dict']
# func_dict['merge_mask']
# ===========================
def dumps_merged_dict(merged_thread_dict):
    out_content = ''
    for item in merged_thread_dict.items():
        c_func_index = item[0]
        func_dict = item[1]
        out_content += dump_one_func_dict(func_dict, 0)

        children_dict = func_dict['children_dict']
        children_list = sorted(children_dict.items(), key=lambda x: abs(x[1]['subtree_event_time']), reverse=True)
        for child_item in children_list:
            child_func_name = child_item[0]
            child_func_dict = child_item[1]
            child_lib_name = child_func_dict['lib_name']
            subtree_event_time = child_func_dict['subtree_event_time']
            if not child_lib_name in TARGET_LIB_LIST:
                continue
            if abs(subtree_event_time) < TIME_THRESHOLD:
                continue
            out_content += dump_one_func_dict(child_func_dict, 1)

    return out_content

def dumps_merged_dict_by_so(merged_thread_dict):
    out_content = ''
    for item in merged_thread_dict.items():
        c_func_index = item[0]
        func_dict = item[1]
        out_content += dump_one_func_dict(func_dict, 0)

        children_dict = func_dict['children_dict']
        children_list = sorted(children_dict.items(), key=lambda x: abs(x[1]['subtree_event_time']), reverse=True)

        for lib in TARGET_LIB_LIST:
            base_name = os.path.basename(lib)
            out_content += '\t' + base_name + '\n'
            for child_item in children_list:
                child_func_name = child_item[0]
                child_func_dict = child_item[1]
                child_lib_name = child_func_dict['lib_name']
                if child_lib_name != lib:
                    continue
                subtree_event_time = child_func_dict['subtree_event_time']
                if abs(subtree_event_time) < TIME_THRESHOLD:
                    continue
                out_content += dump_one_func_dict(child_func_dict, 2)

    return out_content

def compare_nodes(record_data_prev, record_tree_prev, record_data_cur, record_tree_cur, with_so=True):
    prev_lib_id_to_name = record_data_prev.libs.lib_id_to_name
    cur_lib_id_to_name = record_data_cur.libs.lib_id_to_name

    prev_thread_dict = get_thread_dict_by_record_tree(record_tree_prev, prev_lib_id_to_name)
    cur_thread_dict = get_thread_dict_by_record_tree(record_tree_cur, cur_lib_id_to_name)

    merged_thread_dict = dict()

    # 'A', 'M'
    for item in cur_thread_dict.items():
        cur_c_func_index = item[0]
        cur_single_thread_dict = item[1]
        
        cur_c_func_name = cur_single_thread_dict['func_name']
        cur_subtree_event_time = cur_single_thread_dict['subtree_event_time']

        prev_single_thread_dict = prev_thread_dict.get(cur_c_func_index, dict())
        prev_subtree_event_time = prev_single_thread_dict.get('subtree_event_time', 0.0)

        delta_event_time = cur_subtree_event_time - prev_subtree_event_time

        merged_thread_dict[cur_c_func_index] = create_func_dict(func_name=cur_c_func_name, subtree_event_time=delta_event_time)
        merge_mask = 'A'
        if bool(prev_single_thread_dict):
            merge_mask = 'M'
            prev_func_name = prev_single_thread_dict['func_name']
            if prev_func_name != cur_c_func_name:
                merged_thread_dict[cur_c_func_index]['func_name'] = 'prev_' + prev_func_name + '|cur_' + cur_c_func_name

        merged_thread_dict[cur_c_func_index]['merge_mask'] = merge_mask
        do_merge_thread_dict(merged_thread_dict[cur_c_func_index]['children_dict'], prev_single_thread_dict, cur_single_thread_dict)
    
    # 'D'
    for item in prev_thread_dict.items():
        prev_c_func_index = item[0]
        if merged_thread_dict.get(prev_c_func_index, None):
            continue
        prev_single_thread_dict = item[1]
        prev_c_func_name = prev_single_thread_dict['func_name']
        prev_subtree_event_time = prev_single_thread_dict['subtree_event_time']

        merged_thread_dict[prev_c_func_index] = create_func_dict(func_name=prev_c_func_name, subtree_event_time=prev_subtree_event_time, merge_mask='D')
        do_merge_thread_dict(merged_thread_dict[prev_c_func_index]['children_dict'], prev_single_thread_dict, dict())

    if with_so:
        return dumps_merged_dict_by_so(merged_thread_dict)
    else:
        return dumps_merged_dict(merged_thread_dict)

# region Analysis
def modify_text_from_html(text):
    return text.replace('&gt;', '>').replace('&lt;', '<')

def process_call_graph(record_data, record_info, call_graph_info):
    event_count = call_graph_info['e']
    subtree_event_count = call_graph_info['s']

    # maybe -1
    func_id = call_graph_info['f']

    func_name = ''
    lib_id = -1
    if func_id != -1:
        func_map = record_info['functionMap']
        func_node = func_map[func_id]
        lib_id = func_node['l']
        func_name = func_node['f']
        func_name = modify_text_from_html(func_name)

    call_graph = call_graph_info['c']

    child_graph = []
    for item in call_graph:
        sub_graph_dict = process_call_graph(record_data, record_info, item)
        child_graph.append(sub_graph_dict)

    return {
        'lib_id' : lib_id,
        'func_name' : func_name,
        'event_count' : event_count,
        'subtree_event_count' : subtree_event_count,
        'child_graph' : child_graph,
    }

def process_threads(record_data, record_info, record_tree, threads_info):
    for thread in threads_info:
        tid = thread['tid']
        call_graph = process_call_graph(record_data, record_info, thread['g'])

        thread_name = record_info['threadNames'][tid] or str(tid)
        if not call_graph['func_name']:
            call_graph['func_name'] = thread_name

        thread['thread_name'] = thread_name
        thread['call_graph'] = call_graph

        record_tree[tid] = thread

def process_processes(record_data, record_info, record_tree, sample_info):
    for process in sample_info['processes']:
        pid = process['pid']
        process_name = record_info['processNames'][pid] or str(pid)
        record_tree[process_name] = dict()
        process_threads(record_data, record_info, record_tree[process_name], process['threads'])

def process_record_info(record_data, record_info):
    record_tree = dict()
    for sample_info in record_info['sampleInfo']:
        if sample_info['eventName'] in ['cpu-clock', 'cpu-cycles:u']:
            process_processes(record_data, record_info, record_tree, sample_info)
    return record_tree

# endregion

def read_data(filename, args, binary_cache_path, build_addr_hit_map, ndk_path):
    record_data = RecordData(binary_cache_path, build_addr_hit_map, ndk_path)
    record_data.load_record_file(filename, False)

    if args.aggregate_by_thread_name:
        record_data.aggregate_by_thread_name()

    record_data.limit_percents(args.min_func_percent, args.min_callchain_percent)

    return record_data

def write_data(data):
    file_path = os.path.abspath("./result")
    if not os.path.exists(file_path):
        os.makedirs(file_path)

    with open(file_path + "/compare_data.txt", 'w+', newline='', encoding='utf-8') as file:
        file.write(data)

def do_compare(args, binary_cache_path, build_addr_hit_map, ndk_path):
    
    file_list = args.record_file_list

    record_data_prev = read_data(file_list[0], args, binary_cache_path, build_addr_hit_map, ndk_path)
    record_info_prev = record_data_prev.gen_record_info()
    record_tree_prev = process_record_info(record_data_prev, record_info_prev)

    record_data_cur = read_data(file_list[1], args, binary_cache_path, build_addr_hit_map, ndk_path)
    record_info_cur = record_data_cur.gen_record_info()
    record_tree_cur = process_record_info(record_data_cur, record_info_cur)

    diff_content = compare_nodes(record_data_prev, record_tree_prev, record_data_cur, record_tree_cur, True)

    write_data(diff_content)


def main():
    sys.setrecursionlimit(MAX_CALLSTACK_LENGTH * 2 + 50)
    parser = argparse.ArgumentParser(description='report profiling data')
    parser.add_argument('-f', '--record_file_list', nargs='+', default=['perf_prev.data', 'perf_cur.data'], help="""
                        Set profiling data file to report. Default is perf.data.""")

    parser.add_argument('-i', '--record_file', nargs='+', default=['perf.data'], help="""
                        Set profiling data file to report. Default is perf.data.""")
    parser.add_argument('-o', '--report_path', default='report.html', help="""
                        Set output html file. Default is report.html.""")
    parser.add_argument('--min_func_percent', default=0.01, type=float, help="""
                        Set min percentage of functions shown in the report.
                        For example, when set to 0.01, only functions taking >= 0.01%% of total
                        event count are collected in the report. Default is 0.01.""")
    parser.add_argument('--min_callchain_percent', default=0.01, type=float, help="""
                        Set min percentage of callchains shown in the report.
                        It is used to limit nodes shown in the function flamegraph. For example,
                        when set to 0.01, only callchains taking >= 0.01%% of the event count of
                        the starting function are collected in the report. Default is 0.01.""")
    parser.add_argument('--add_source_code', action='store_true', help='Add source code.')
    parser.add_argument('--source_dirs', nargs='+', help='Source code directories.')
    parser.add_argument('--add_disassembly', action='store_true', help='Add disassembled code.')
    parser.add_argument('--binary_filter', nargs='+', help="""Annotate source code and disassembly
                        only for selected binaries.""")
    parser.add_argument('--ndk_path', nargs=1, help='Find tools in the ndk path.')
    parser.add_argument('--no_browser', action='store_true', help="Don't open report in browser.")
    parser.add_argument('--show_art_frames', action='store_true',
                        help='Show frames of internal methods in the ART Java interpreter.')
    parser.add_argument('--aggregate-by-thread-name', action='store_true', help="""aggregate
                        samples by thread name instead of thread id. This is useful for
                        showing multiple perf.data generated for the same app.""")

    args = parser.parse_args()

    # 1. Process args.
    binary_cache_path = 'binary_cache'
    if not os.path.isdir(binary_cache_path):
        if args.add_source_code or args.add_disassembly:
            log_exit("""binary_cache/ doesn't exist. Can't add source code or disassembled code
                        without collected binaries. Please run binary_cache_builder.py to
                        collect binaries for current profiling data, or run app_profiler.py
                        without -nb option.""")
        binary_cache_path = None

    if args.add_source_code and not args.source_dirs:
        log_exit('--source_dirs is needed to add source code.')

    build_addr_hit_map = args.add_source_code or args.add_disassembly
    ndk_path = None if not args.ndk_path else args.ndk_path[0]

    do_compare(args, binary_cache_path, build_addr_hit_map, ndk_path)


if __name__ == '__main__':
    # NOTE: original file had debugpy.listen()/wait_for_client() here which
    # caused the script to block unless a VS Code debugger was attached.
    # That block is intentionally removed in this archive copy to allow the
    # file to be imported/run without a debugger.
    main()
