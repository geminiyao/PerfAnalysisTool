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
    float u_xlat0;
    half4 u_xlat16_0;
    uint4 u_xlatu0;
    bool u_xlatb0;
    float u_xlat1;
    uint4 u_xlatu1;
    bool u_xlatb1;
    half4 u_xlat16_2;
    uint4 u_xlatu3;
    half4 u_xlat16_4;
    half4 u_xlat16_5;
    half4 u_xlat16_6;
    uint4 u_xlatu7;
    half4 u_xlat16_8;
    float u_xlat18;
    bool u_xlatb18;
    float u_xlat27;
    bool u_xlatb27;
    u_xlatu0.z = uint(0x0u);
    u_xlatu0.w = uint(0x0u);
    u_xlatu1 = mtl_ThreadID.xyxy * uint4(0x2u, 0x2u, 0x2u, 0x2u) + uint4(0x1u, 0x0u, 0x0u, 0x1u);
    u_xlatu0.xy = u_xlatu1.zw;
    u_xlat16_2 = ResultCopy.read(u_xlatu0.xy, u_xlatu0.w);
    u_xlatu3.z = uint(0x0u);
    u_xlatu3.w = uint(0x0u);
    u_xlatu3.xy = mtl_ThreadID.xy << uint2(0x1u, 0x1u);
    u_xlat16_4 = ResultCopy.read(u_xlatu3.xy, u_xlatu3.w);
    u_xlat18 = float(u_xlat16_4.w) + 0.5;
    u_xlatb27 = u_xlat18<float(u_xlat16_2.w);
    u_xlat16_5 = (bool(u_xlatb27)) ? u_xlat16_2 : u_xlat16_4;
    u_xlat27 = float(u_xlat16_5.w) + 0.5;
    u_xlatu1.z = uint(0x0u);
    u_xlatu1.w = uint(0x0u);
    u_xlat16_6 = ResultCopy.read(u_xlatu1.xy, u_xlatu1.w);
    u_xlatb27 = u_xlat27<float(u_xlat16_6.w);
    u_xlat16_5 = (bool(u_xlatb27)) ? u_xlat16_6 : u_xlat16_5;
    u_xlat27 = float(u_xlat16_5.w) + 0.5;
    u_xlatu7.z = uint(0x0u);
    u_xlatu7.w = uint(0x0u);
    u_xlatu7.xy = mtl_ThreadID.xy * uint2(0x2u, 0x2u) + uint2(0x1u, 0x1u);
    u_xlat16_8 = ResultCopy.read(u_xlatu7.xy, u_xlatu7.w);
    u_xlatb27 = u_xlat27<float(u_xlat16_8.w);
    u_xlat16_5 = (bool(u_xlatb27)) ? u_xlat16_8 : u_xlat16_5;
    u_xlatb18 = u_xlat18<float(u_xlat16_5.w);
    u_xlat16_4 = (bool(u_xlatb18)) ? u_xlat16_5 : u_xlat16_4;
    Result.write(u_xlat16_4, u_xlatu3.xy);
    u_xlat18 = float(u_xlat16_2.w) + 0.5;
    u_xlatb18 = u_xlat18<float(u_xlat16_5.w);
    u_xlat16_2 = (bool(u_xlatb18)) ? u_xlat16_5 : u_xlat16_2;
    Result.write(u_xlat16_2, u_xlatu0.xy);
    u_xlat0 = float(u_xlat16_6.w) + 0.5;
    u_xlatb0 = u_xlat0<float(u_xlat16_5.w);
    u_xlat16_0 = (bool(u_xlatb0)) ? u_xlat16_5 : u_xlat16_6;
    Result.write(u_xlat16_0, u_xlatu1.xy);
    u_xlat1 = float(u_xlat16_8.w) + 0.5;
    u_xlatb1 = u_xlat1<float(u_xlat16_5.w);
    u_xlat16_0 = (bool(u_xlatb1)) ? u_xlat16_5 : u_xlat16_8;
    Result.write(u_xlat16_0, u_xlatu7.xy);
    return;
}
