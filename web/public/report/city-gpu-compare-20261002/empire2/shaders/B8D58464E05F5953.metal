#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

kernel void computeMain(
    texture2d<half, access::write > Result [[ texture(0) ]] ,
    texture2d<float, access::write > Height [[ texture(1) ]] ,
    uint3 mtl_ThreadID [[ thread_position_in_grid ]])
{
    Result.write(half4(0.0, 0.0, 0.0, 0.0), mtl_ThreadID.xy);
    Height.write(float4(1000.0, 1000.0, 1000.0, 1000.0), mtl_ThreadID.xy);
    return;
}
