#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

kernel void computeMain(
    texture2d<half, access::sample > ResultCopy [[ texture(1) ]] ,
    texture2d<half, access::write > Result [[ texture(0) ]] ,
    uint3 mtl_ThreadID [[ thread_position_in_grid ]])
{
    half4 u_xlat16_0;
    uint4 u_xlatu0;
    u_xlatu0.xy = mtl_ThreadID.xy;
    u_xlatu0.z = uint(0x0u);
    u_xlatu0.w = uint(0x0u);
    u_xlat16_0 = ResultCopy.read(u_xlatu0.xy, u_xlatu0.w);
    Result.write(u_xlat16_0, mtl_ThreadID.xy);
    return;
}
