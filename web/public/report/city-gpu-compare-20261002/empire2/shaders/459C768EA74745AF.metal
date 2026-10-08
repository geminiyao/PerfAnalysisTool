#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct Globals_Type
{
    int _ShadowCasterFilter ;
};

struct _VGCBuffer_Type
{
    uint _MaxCullingInstanceCount ;
    float3 _CameraWorldSpacePosition ;
    float4 _GPUFrustumPlanes [6];
    float _ErrorThreshold ;
    float _ScreenHeight ;
    float _CotHalfFov ;
    int _IsOrthographic ;
    float3 _SelfVisibilityForwardDir ;
    float _DebugViewMode ;
    int _DebugClusterLOD ;
    int _GlobalMinLOD ;
};

struct InstanceDataBuffer_Type
{
    uint value[68];
};

struct VGMeshBuffer_Type
{
    uint value[12];
};

struct BVHNodeListA_Type
{
    uint value[2];
};

struct IndirectArgsBuffer_Type
{
    uint value[1];
};

kernel void computeMain(
    constant Globals_Type& Globals [[ buffer(2) ]],
    constant _VGCBuffer_Type& _VGCBuffer [[ buffer(3) ]],
    const device InstanceDataBuffer_Type *InstanceDataBuffer [[ buffer(4) ]],
    const device VGMeshBuffer_Type *VGMeshBuffer [[ buffer(5) ]],
    device BVHNodeListA_Type *BVHNodeListA [[ buffer(0) ]],
    device IndirectArgsBuffer_Type *IndirectArgsBuffer [[ buffer(1) ]],
    uint3 mtl_ThreadID [[ thread_position_in_grid ]])
{
    InstanceDataBuffer = reinterpret_cast<const device InstanceDataBuffer_Type *> (reinterpret_cast<device const atomic_uint *> (InstanceDataBuffer) + 1);
    VGMeshBuffer = reinterpret_cast<const device VGMeshBuffer_Type *> (reinterpret_cast<device const atomic_uint *> (VGMeshBuffer) + 1);
    BVHNodeListA = reinterpret_cast<device BVHNodeListA_Type *> (reinterpret_cast<device atomic_uint *> (BVHNodeListA) + 1);
    IndirectArgsBuffer = reinterpret_cast<device IndirectArgsBuffer_Type *> (reinterpret_cast<device atomic_uint *> (IndirectArgsBuffer) + 1);
    int u_xlati0;
    uint2 u_xlatu0;
    bool u_xlatb0;
    float4 u_xlat1;
    int u_xlati1;
    float4 u_xlat2;
    float4 u_xlat3;
    float4 u_xlat4;
    int u_xlati5;
    float4 u_xlat6;
    float4 u_xlat7;
    float4 u_xlat8;
    float4 u_xlat9;
    float4 u_xlat10;
    float3 u_xlat11;
    int2 u_xlati11;
    bool2 u_xlatb11;
    bool u_xlatb16;
    float2 u_xlat22;
    int u_xlati22;
    bool2 u_xlatb22;
    float u_xlat33;
    bool u_xlatb33;
    u_xlatb0 = mtl_ThreadID.x>=_VGCBuffer._MaxCullingInstanceCount;
    if(u_xlatb0){
        return;
    }
    u_xlati0 = int(InstanceDataBuffer[mtl_ThreadID.x].value[(0x9c >> 2) + 0]);
    u_xlati11.xy = int2(uint2(u_xlati0) & uint2(0x1u, 0x8u));
    u_xlati22 = (u_xlati11.y != 0) ? 0x2 : 0x1;
    u_xlati11.y = int(uint(u_xlati22) & uint(Globals._ShadowCasterFilter));
    u_xlatb11.xy = (u_xlati11.xy==int2(0x0, 0x0));
    u_xlatb11.x = u_xlatb11.y || u_xlatb11.x;
    if(u_xlatb11.x){
        return;
    }
    u_xlat1 = float4(as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x0 >> 2) + 0]), as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x0 >> 2) + 1]), as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x0 >> 2) + 2]), as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x0 >> 2) + 3]));
    u_xlat2 = float4(as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x10 >> 2) + 0]), as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x10 >> 2) + 1]), as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x10 >> 2) + 2]), as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x10 >> 2) + 3]));
    u_xlat3 = float4(as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x20 >> 2) + 0]), as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x20 >> 2) + 1]), as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x20 >> 2) + 2]), as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x20 >> 2) + 3]));
    u_xlat4 = float4(as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x30 >> 2) + 0]), as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x30 >> 2) + 1]), as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x30 >> 2) + 2]), as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x30 >> 2) + 3]));
    u_xlat11.xyz = float3(as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x80 >> 2) + 0]), as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x80 >> 2) + 1]), as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x80 >> 2) + 2]));
    u_xlati5 = int(InstanceDataBuffer[mtl_ThreadID.x].value[(0x94 >> 2) + 0]);
    u_xlat6 = float4(as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0xe0 >> 2) + 0]), as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0xe0 >> 2) + 1]), as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0xe0 >> 2) + 2]), as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0xe0 >> 2) + 3]));
    u_xlat7 = float4(as_type<float>(VGMeshBuffer[u_xlati5].value[(0x0 >> 2) + 0]), as_type<float>(VGMeshBuffer[u_xlati5].value[(0x0 >> 2) + 1]), as_type<float>(VGMeshBuffer[u_xlati5].value[(0x0 >> 2) + 2]), as_type<float>(VGMeshBuffer[u_xlati5].value[(0x0 >> 2) + 3]));
    u_xlati0 = int(uint(u_xlati0) & 0x2u);
    u_xlatb0 = u_xlati0!=0x0;
    u_xlatb16 = 0.0<u_xlat6.w;
    u_xlatb16 = u_xlatb0 && u_xlatb16;
    u_xlat8.x = u_xlat1.x;
    u_xlat8.y = u_xlat2.x;
    u_xlat8.z = u_xlat3.x;
    u_xlat8.w = u_xlat4.x;
    u_xlat9.xyz = u_xlat7.xyz;
    u_xlat9.w = 1.0;
    u_xlat8.x = dot(u_xlat8, u_xlat9);
    u_xlat10.x = u_xlat1.y;
    u_xlat10.y = u_xlat2.y;
    u_xlat10.z = u_xlat3.y;
    u_xlat10.w = u_xlat4.y;
    u_xlat8.y = dot(u_xlat10, u_xlat9);
    u_xlat10.x = u_xlat1.z;
    u_xlat10.y = u_xlat2.z;
    u_xlat10.z = u_xlat3.z;
    u_xlat10.w = u_xlat4.z;
    u_xlat8.z = dot(u_xlat10, u_xlat9);
    u_xlat4.x = u_xlat1.w;
    u_xlat4.y = u_xlat2.w;
    u_xlat4.z = u_xlat3.w;
    u_xlat8.w = dot(u_xlat4, u_xlat9);
    u_xlat1.xyz = u_xlat6.xyz;
    u_xlat1.w = 1.0;
    u_xlat1 = (bool(u_xlatb16)) ? u_xlat1 : u_xlat8;
    u_xlat22.x = max(abs(u_xlat11.z), abs(u_xlat11.y));
    u_xlat11.x = max(u_xlat22.x, abs(u_xlat11.x));
    u_xlat11.x = u_xlat11.x * u_xlat7.w;
    u_xlat11.x = (u_xlatb16) ? u_xlat6.w : u_xlat11.x;
    u_xlati22 = ~((int(u_xlatb16) * int(0xffffffffu)));
    u_xlati0 = u_xlatb0 ? u_xlati22 : int(0);
    u_xlat22.x = dot(u_xlat1, _VGCBuffer._GPUFrustumPlanes[0]);
    u_xlat22.y = dot(u_xlat1, _VGCBuffer._GPUFrustumPlanes[1]);
    u_xlatb22.xy = (u_xlat22.xy>=(-u_xlat11.xx));
    u_xlatb22.x = u_xlatb22.y && u_xlatb22.x;
    u_xlat33 = dot(u_xlat1, _VGCBuffer._GPUFrustumPlanes[2]);
    u_xlatb33 = u_xlat33>=(-u_xlat11.x);
    u_xlatb22.x = u_xlatb33 && u_xlatb22.x;
    u_xlat33 = dot(u_xlat1, _VGCBuffer._GPUFrustumPlanes[3]);
    u_xlatb33 = u_xlat33>=(-u_xlat11.x);
    u_xlatb22.x = u_xlatb33 && u_xlatb22.x;
    u_xlat33 = dot(u_xlat1, _VGCBuffer._GPUFrustumPlanes[4]);
    u_xlatb33 = u_xlat33>=(-u_xlat11.x);
    u_xlatb22.x = u_xlatb33 && u_xlatb22.x;
    u_xlat33 = dot(u_xlat1, _VGCBuffer._GPUFrustumPlanes[5]);
    u_xlatb11.x = u_xlat33>=(-u_xlat11.x);
    u_xlatb11.x = u_xlatb11.x && u_xlatb22.x;
    u_xlati0 = int((uint(u_xlatb11.x) * 0xffffffffu) | uint(u_xlati0));
    if((uint(u_xlati0))!=uint(0)){
        u_xlatu0.y = VGMeshBuffer[u_xlati5].value[(0x10 >> 2) + 0];
        u_xlati1 = int(atomic_fetch_add_explicit(reinterpret_cast<device atomic_uint *>(&IndirectArgsBuffer[int(0x0)].value[int(0x0) >> 2]), 0x1u, memory_order::memory_order_relaxed));
        u_xlatu0.x = mtl_ThreadID.x;
        BVHNodeListA[u_xlati1].value[(0x0 >> 2)] = u_xlatu0.x;
        BVHNodeListA[u_xlati1].value[(0x0 >> 2) + 1] = u_xlatu0.y;
    }
    return;
}
