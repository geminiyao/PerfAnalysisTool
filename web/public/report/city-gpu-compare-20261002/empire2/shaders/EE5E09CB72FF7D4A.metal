#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct Globals_Type
{
    float4 _ScreenSize ;
    float2 _CacheUAVTex_Size ;
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
    uint2 u_xlatu0;
    bool2 u_xlatb0;
    float4 u_xlat1;
    float4 u_xlat2;
    float3 u_xlat3;
    float3 u_xlat4;
    float3 u_xlat5;
    float4 u_xlat6;
    float2 u_xlat8;
    float u_xlat9;
    float2 u_xlat10;
    float2 u_xlat14;
    int u_xlati15;
    float u_xlat22;
    bool u_xlatb22;
    int u_xlati25;
    u_xlat0.xy = rint(Globals._CacheUAVTex_Size.xyxx.xy);
    u_xlatu0.xy = uint2(u_xlat0.xy);
    u_xlatb0.xy = (mtl_ThreadID.xy>=u_xlatu0.xy);
    u_xlatb0.x = u_xlatb0.y || u_xlatb0.x;
    if(u_xlatb0.x){
        return;
    }
    u_xlat0.xy = float2(mtl_ThreadID.xy);
    u_xlat0.xy = fma(u_xlat0.xy, float2(8.0, 8.0), float2(0.5, 0.5));
    u_xlat14.xy = rint(Globals._ScreenSize.zw);
    u_xlat1.xy = u_xlat14.xy + float2(-0.5, -0.5);
    u_xlat2.x = 0.0;
    u_xlat2.zw = u_xlat0.xy;
    u_xlati15 = 0x0;
    while(true){
        u_xlatb22 = u_xlati15>=0x8;
        if(u_xlatb22){break;}
        u_xlat10.x = float(u_xlati15);
        u_xlat4.xyz = u_xlat2.xzw;
        u_xlati25 = 0x0;
        while(true){
            u_xlatb22 = u_xlati25>=0x8;
            if(u_xlatb22){break;}
            u_xlat10.y = float(u_xlati25);
            u_xlat5.yz = u_xlat0.xy + u_xlat10.xy;
            u_xlat3.xz = min(u_xlat1.xy, u_xlat5.yz);
            u_xlat3.xz = u_xlat3.xz / u_xlat14.xy;
            u_xlat6 = u_xlat5.yzyz + float4(1.0, 0.0, 0.0, 1.0);
            u_xlat6 = min(u_xlat1.xyxy, u_xlat6);
            u_xlat6 = u_xlat6 / u_xlat14.xyxy;
            u_xlat22 = _LastDepth.sample(PointClampSampler, u_xlat3.xz, level(0.0)).x;
            u_xlat9 = _LastDepth.sample(PointClampSampler, u_xlat6.xy, level(0.0)).x;
            u_xlat3.x = _LastDepth.sample(PointClampSampler, u_xlat6.zw, level(0.0)).x;
            u_xlat9 = (-u_xlat22) + u_xlat9;
            u_xlat22 = (-u_xlat22) + u_xlat3.x;
            u_xlat22 = u_xlat22 * u_xlat22;
            u_xlat5.x = fma(u_xlat9, u_xlat9, u_xlat22);
            u_xlatb22 = u_xlat5.x>=u_xlat4.x;
            if(u_xlatb22){
                u_xlat4.xyz = u_xlat5.xyz;
            }
            u_xlati25 = u_xlati25 + 0x1;
        }
        u_xlat2.xzw = u_xlat4.xyz;
        u_xlati15 = u_xlati15 + 0x1;
    }
    u_xlat0.xy = min(u_xlat1.xy, u_xlat2.zw);
    u_xlat0.zw = u_xlat0.xy / u_xlat14.xy;
    u_xlat1.x = _LastDepth.sample(PointClampSampler, u_xlat0.zw, level(0.0)).x;
    u_xlat8.xy = fma(u_xlat0.zw, float2(2.0, 2.0), float2(-1.0, -1.0));
    u_xlat2 = u_xlat8.yyyy * Globals.hlslcc_mtx4x4_Last_IVP[1];
    u_xlat2 = fma(Globals.hlslcc_mtx4x4_Last_IVP[0], u_xlat8.xxxx, u_xlat2);
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
