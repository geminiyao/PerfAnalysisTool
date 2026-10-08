#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct Globals_Type
{
    float4 _ScreenSize ;
    float4 hlslcc_mtx4x4_Last_IVP [4];
    float4 hlslcc_mtx4x4_Current_VP [4];
};

kernel void computeMain(
    constant Globals_Type& Globals [[ buffer(0) ]],
    texture2d<float, access::sample > _LastDepth [[ texture(1) ]] ,
    texture2d<float, access::write > _CacheUAVTex [[ texture(0) ]] ,
    uint3 mtl_ThreadID [[ thread_position_in_grid ]])
{
    constexpr sampler PointClampSampler(filter::nearest,address::clamp_to_edge);
    float4 u_xlat0;
    float4 u_xlat1;
    float4 u_xlat2;
    bool u_xlatb2;
    float3 u_xlat3;
    float3 u_xlat4;
    float4 u_xlat5;
    float2 u_xlat7;
    int u_xlati7;
    float2 u_xlat8;
    float2 u_xlat12;
    float u_xlat14;
    float u_xlat20;
    int u_xlati21;
    u_xlat0.xy = float2(mtl_ThreadID.xy);
    u_xlat0.xy = fma(u_xlat0.xy, float2(16.0, 16.0), float2(0.5, 0.5));
    u_xlat12.xy = rint(Globals._ScreenSize.zw);
    u_xlat1.zw = u_xlat0.xy;
    u_xlat1.x = float(0.0);
    u_xlati7 = int(0x0);
    while(true){
        u_xlatb2 = u_xlati7>=0x10;
        if(u_xlatb2){break;}
        u_xlat8.x = float(u_xlati7);
        u_xlat3.xyz = u_xlat1.xzw;
        u_xlati21 = 0x0;
        while(true){
            u_xlatb2 = u_xlati21>=0x10;
            if(u_xlatb2){break;}
            u_xlat8.y = float(u_xlati21);
            u_xlat4.yz = u_xlat0.xy + u_xlat8.xy;
            u_xlat2.xz = u_xlat4.yz / u_xlat12.xy;
            u_xlat5 = u_xlat4.yzyz + float4(1.0, 0.0, 0.0, 1.0);
            u_xlat5 = u_xlat5 / u_xlat12.xyxy;
            u_xlat2.x = _LastDepth.sample(PointClampSampler, u_xlat2.xz, level(0.0)).x;
            u_xlat14 = _LastDepth.sample(PointClampSampler, u_xlat5.xy, level(0.0)).x;
            u_xlat20 = _LastDepth.sample(PointClampSampler, u_xlat5.zw, level(0.0)).x;
            u_xlat14 = (-u_xlat2.x) + u_xlat14;
            u_xlat2.x = (-u_xlat2.x) + u_xlat20;
            u_xlat2.x = u_xlat2.x * u_xlat2.x;
            u_xlat4.x = fma(u_xlat14, u_xlat14, u_xlat2.x);
            u_xlatb2 = u_xlat4.x>=u_xlat3.x;
            if(u_xlatb2){
                u_xlat3.xyz = u_xlat4.xyz;
            }
            u_xlati21 = u_xlati21 + 0x1;
        }
        u_xlat1.xzw = u_xlat3.xyz;
        u_xlati7 = u_xlati7 + 0x1;
    }
    u_xlat0.zw = u_xlat1.zw / u_xlat12.xy;
    u_xlat1.x = _LastDepth.sample(PointClampSampler, u_xlat0.zw, level(0.0)).x;
    u_xlat7.xy = fma(u_xlat0.zw, float2(2.0, 2.0), float2(-1.0, -1.0));
    u_xlat2 = u_xlat7.yyyy * Globals.hlslcc_mtx4x4_Last_IVP[1];
    u_xlat2 = fma(Globals.hlslcc_mtx4x4_Last_IVP[0], u_xlat7.xxxx, u_xlat2);
    u_xlat1 = fma(Globals.hlslcc_mtx4x4_Last_IVP[2], u_xlat1.xxxx, u_xlat2);
    u_xlat1 = u_xlat1 + Globals.hlslcc_mtx4x4_Last_IVP[3];
    u_xlat1.xyz = u_xlat1.xyz / u_xlat1.www;
    u_xlat2.xyz = u_xlat1.yyy * Globals.hlslcc_mtx4x4_Current_VP[1].xyw;
    u_xlat1.xyw = fma(Globals.hlslcc_mtx4x4_Current_VP[0].xyw, u_xlat1.xxx, u_xlat2.xyz);
    u_xlat1.xyz = fma(Globals.hlslcc_mtx4x4_Current_VP[2].xyw, u_xlat1.zzz, u_xlat1.xyw);
    u_xlat1.xyz = u_xlat1.xyz + Globals.hlslcc_mtx4x4_Current_VP[3].xyw;
    u_xlat1.xy = u_xlat1.xy / u_xlat1.zz;
    u_xlat1.xy = fma(u_xlat1.xy, float2(0.5, 0.5), float2(0.5, 0.5));
    u_xlat0.xy = fma(u_xlat1.xy, float2(1.0, -1.0), float2(0.0, 1.0));
    _CacheUAVTex.write(u_xlat0, mtl_ThreadID.xy);
    return;
}
