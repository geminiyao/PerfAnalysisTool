#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

kernel void computeMain(
    texture2d<uint, access::write > ProjectionDataRT [[ texture(0) ]] ,
    texture2d<half, access::write > ReflectionColorRT [[ texture(1) ]] ,
    uint3 mtl_ThreadID [[ thread_position_in_grid ]])
{
    ProjectionDataRT.write(uint4(0xffffffffu, 0xffffffffu, 0xffffffffu, 0xffffffffu), mtl_ThreadID.xy);
    ReflectionColorRT.write(half4(0.0, 0.0, 0.0, 0.0), mtl_ThreadID.xy);
    return;
}
