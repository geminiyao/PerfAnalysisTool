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

struct _VGDirtyRegionCBuffer_Type
{
    uint _DirtyBoundsCount ;
    float4 hlslcc_mtx4x4_DirtyLightViewMatrix [4];
    float4 _DirtyBounds [20];
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
    constant _VGDirtyRegionCBuffer_Type& _VGDirtyRegionCBuffer [[ buffer(4) ]],
    const device InstanceDataBuffer_Type *InstanceDataBuffer [[ buffer(5) ]],
    const device VGMeshBuffer_Type *VGMeshBuffer [[ buffer(6) ]],
    device BVHNodeListA_Type *BVHNodeListA [[ buffer(0) ]],
    device IndirectArgsBuffer_Type *IndirectArgsBuffer [[ buffer(1) ]],
    uint3 mtl_ThreadID [[ thread_position_in_grid ]])
{
    InstanceDataBuffer = reinterpret_cast<const device InstanceDataBuffer_Type *> (reinterpret_cast<device const atomic_uint *> (InstanceDataBuffer) + 1);
    VGMeshBuffer = reinterpret_cast<const device VGMeshBuffer_Type *> (reinterpret_cast<device const atomic_uint *> (VGMeshBuffer) + 1);
    BVHNodeListA = reinterpret_cast<device BVHNodeListA_Type *> (reinterpret_cast<device atomic_uint *> (BVHNodeListA) + 1);
    IndirectArgsBuffer = reinterpret_cast<device IndirectArgsBuffer_Type *> (reinterpret_cast<device atomic_uint *> (IndirectArgsBuffer) + 1);
    float4 u_xlat0;
    int u_xlati0;
    uint2 u_xlatu0;
    bool u_xlatb0;
    float4 u_xlat1;
    int u_xlati1;
    uint2 u_xlatu1;
    float4 u_xlat2;
    int u_xlati2;
    uint2 u_xlatu2;
    float4 u_xlat3;
    float4 u_xlat4;
    float4 u_xlat5;
    float4 u_xlat6;
    float4 u_xlat7;
    float4 u_xlat8;
    float4 u_xlat9;
    float u_xlat10;
    int2 u_xlati10;
    bool2 u_xlatb10;
    float2 u_xlat12;
    bool2 u_xlatb12;
    int u_xlati20;
    int u_xlati21;
    bool u_xlatb21;
    float2 u_xlat22;
    bool u_xlatb22;
    int u_xlati30;
    bool u_xlatb30;
    float u_xlat31;
    bool u_xlatb31;
    u_xlatb0 = mtl_ThreadID.x>=_VGCBuffer._MaxCullingInstanceCount;
    if(u_xlatb0){
        return;
    }
    u_xlati0 = int(InstanceDataBuffer[mtl_ThreadID.x].value[(0x9c >> 2) + 0]);
    u_xlati10.xy = int2(uint2(u_xlati0) & uint2(0x1u, 0x8u));
    u_xlati20 = (u_xlati10.y != 0) ? 0x2 : 0x1;
    u_xlati10.y = int(uint(u_xlati20) & uint(Globals._ShadowCasterFilter));
    u_xlatb10.xy = (u_xlati10.xy==int2(0x0, 0x0));
    u_xlatb10.x = u_xlatb10.y || u_xlatb10.x;
    if(u_xlatb10.x){
        return;
    }
    u_xlat1 = float4(as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x0 >> 2) + 0]), as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x0 >> 2) + 1]), as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x0 >> 2) + 2]), as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x0 >> 2) + 3]));
    u_xlat2 = float4(as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x10 >> 2) + 0]), as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x10 >> 2) + 1]), as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x10 >> 2) + 2]), as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x10 >> 2) + 3]));
    u_xlat3 = float4(as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x20 >> 2) + 0]), as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x20 >> 2) + 1]), as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x20 >> 2) + 2]), as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x20 >> 2) + 3]));
    u_xlat4 = float4(as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x30 >> 2) + 0]), as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x30 >> 2) + 1]), as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x30 >> 2) + 2]), as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x30 >> 2) + 3]));
    u_xlat10 = as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0x80 >> 2) + 0]);
    u_xlati20 = int(InstanceDataBuffer[mtl_ThreadID.x].value[(0x94 >> 2) + 0]);
    u_xlat5 = float4(as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0xe0 >> 2) + 0]), as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0xe0 >> 2) + 1]), as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0xe0 >> 2) + 2]), as_type<float>(InstanceDataBuffer[mtl_ThreadID.x].value[(0xe0 >> 2) + 3]));
    u_xlat6 = float4(as_type<float>(VGMeshBuffer[u_xlati20].value[(0x0 >> 2) + 0]), as_type<float>(VGMeshBuffer[u_xlati20].value[(0x0 >> 2) + 1]), as_type<float>(VGMeshBuffer[u_xlati20].value[(0x0 >> 2) + 2]), as_type<float>(VGMeshBuffer[u_xlati20].value[(0x0 >> 2) + 3]));
    u_xlati0 = int(uint(u_xlati0) & 0x2u);
    u_xlati0 = int((u_xlati0!=0x0) ? 0xFFFFFFFFu : uint(0));
    u_xlatb30 = 0.0<u_xlat5.w;
    u_xlati30 = u_xlatb30 ? u_xlati0 : int(0);
    u_xlat7.x = u_xlat1.x;
    u_xlat7.y = u_xlat2.x;
    u_xlat7.z = u_xlat3.x;
    u_xlat7.w = u_xlat4.x;
    u_xlat8.xyz = u_xlat6.xyz;
    u_xlat8.w = 1.0;
    u_xlat7.x = dot(u_xlat7, u_xlat8);
    u_xlat9.x = u_xlat1.y;
    u_xlat9.y = u_xlat2.y;
    u_xlat9.z = u_xlat3.y;
    u_xlat9.w = u_xlat4.y;
    u_xlat7.y = dot(u_xlat9, u_xlat8);
    u_xlat9.x = u_xlat1.z;
    u_xlat9.y = u_xlat2.z;
    u_xlat9.z = u_xlat3.z;
    u_xlat9.w = u_xlat4.z;
    u_xlat7.z = dot(u_xlat9, u_xlat8);
    u_xlat4.x = u_xlat1.w;
    u_xlat4.y = u_xlat2.w;
    u_xlat4.z = u_xlat3.w;
    u_xlat7.w = dot(u_xlat4, u_xlat8);
    u_xlat1.xyz = u_xlat5.xyz;
    u_xlat1.w = 1.0;
    u_xlat1 = (int(u_xlati30) != 0) ? u_xlat1 : u_xlat7;
    u_xlat10 = u_xlat10 * u_xlat6.w;
    u_xlat10 = (u_xlati30 != 0) ? u_xlat5.w : u_xlat10;
    u_xlati2 = ~(u_xlati30);
    u_xlati2 = int(uint(u_xlati0) & uint(u_xlati2));
    u_xlat12.x = dot(u_xlat1, _VGCBuffer._GPUFrustumPlanes[0]);
    u_xlat12.y = dot(u_xlat1, _VGCBuffer._GPUFrustumPlanes[1]);
    u_xlatb12.xy = (u_xlat12.xy>=(-float2(u_xlat10)));
    u_xlatb12.x = u_xlatb12.y && u_xlatb12.x;
    u_xlat22.x = dot(u_xlat1, _VGCBuffer._GPUFrustumPlanes[2]);
    u_xlatb22 = u_xlat22.x>=(-u_xlat10);
    u_xlatb12.x = u_xlatb22 && u_xlatb12.x;
    u_xlat22.x = dot(u_xlat1, _VGCBuffer._GPUFrustumPlanes[3]);
    u_xlatb22 = u_xlat22.x>=(-u_xlat10);
    u_xlatb12.x = u_xlatb22 && u_xlatb12.x;
    u_xlat22.x = dot(u_xlat1, _VGCBuffer._GPUFrustumPlanes[4]);
    u_xlatb22 = u_xlat22.x>=(-u_xlat10);
    u_xlatb12.x = u_xlatb22 && u_xlatb12.x;
    u_xlat31 = dot(u_xlat1, _VGCBuffer._GPUFrustumPlanes[5]);
    u_xlatb31 = u_xlat31>=(-u_xlat10);
    u_xlatb31 = u_xlatb31 && u_xlatb12.x;
    u_xlatu2.x = (uint(u_xlatb31) * 0xffffffffu) | uint(u_xlati2);
    u_xlati0 = ~(u_xlati0);
    u_xlati0 = int(uint(u_xlati30) | uint(u_xlati0));
    u_xlati0 = int(uint(u_xlati0) & u_xlatu2.x);
    if((uint(u_xlati0))!=uint(0)){
        u_xlat0.xw = u_xlat1.yy * _VGDirtyRegionCBuffer.hlslcc_mtx4x4_DirtyLightViewMatrix[1].xy;
        u_xlat0.xw = fma(_VGDirtyRegionCBuffer.hlslcc_mtx4x4_DirtyLightViewMatrix[0].xy, u_xlat1.xx, u_xlat0.xw);
        u_xlat0.xw = fma(_VGDirtyRegionCBuffer.hlslcc_mtx4x4_DirtyLightViewMatrix[2].xy, u_xlat1.zz, u_xlat0.xw);
        u_xlat0.xw = u_xlat0.xw + _VGDirtyRegionCBuffer.hlslcc_mtx4x4_DirtyLightViewMatrix[3].xy;
        u_xlatu1.y = 0x0u;
        u_xlatu2.x = uint(0x0u);
        u_xlatu2.y = uint(0x0u);
        u_xlati21 = 0x0;
        while(true){
            u_xlatb31 = u_xlatu2.y>=_VGDirtyRegionCBuffer._DirtyBoundsCount;
            u_xlati21 = 0x0;
            if(u_xlatb31){break;}
            u_xlat22.xy = _VGDirtyRegionCBuffer.hlslcc_mtx4x4_DirtyLightViewMatrix[1].xy * _VGDirtyRegionCBuffer._DirtyBounds[int(u_xlatu2.y)].yy;
            u_xlat22.xy = fma(_VGDirtyRegionCBuffer.hlslcc_mtx4x4_DirtyLightViewMatrix[0].xy, _VGDirtyRegionCBuffer._DirtyBounds[int(u_xlatu2.y)].xx, u_xlat22.xy);
            u_xlat22.xy = fma(_VGDirtyRegionCBuffer.hlslcc_mtx4x4_DirtyLightViewMatrix[2].xy, _VGDirtyRegionCBuffer._DirtyBounds[int(u_xlatu2.y)].zz, u_xlat22.xy);
            u_xlat22.xy = u_xlat22.xy + _VGDirtyRegionCBuffer.hlslcc_mtx4x4_DirtyLightViewMatrix[3].xy;
            u_xlat22.xy = u_xlat0.xw + (-u_xlat22.xy);
            u_xlat31 = dot(u_xlat22.xy, u_xlat22.xy);
            u_xlat31 = sqrt(u_xlat31);
            u_xlat22.x = fma(u_xlat10, 1.74000001, _VGDirtyRegionCBuffer._DirtyBounds[int(u_xlatu2.y)].w);
            u_xlatb31 = u_xlat31<u_xlat22.x;
            if(u_xlatb31){
                u_xlatu2.x = 0xffffffffu;
                u_xlati21 = int(0xffffffffu);
                break;
            }
            u_xlatu1.x = u_xlatu2.y + 0x1u;
            u_xlatu2.xy = u_xlatu1.yx;
            u_xlatb21 = u_xlatb31;
        }
        if((uint(u_xlati21))==uint(0)){
            u_xlatu2.x = 0x0u;
        }
    }
    if((u_xlatu2.x)!=uint(0)){
        u_xlatu0.y = VGMeshBuffer[u_xlati20].value[(0x10 >> 2) + 0];
        u_xlati1 = int(atomic_fetch_add_explicit(reinterpret_cast<device atomic_uint *>(&IndirectArgsBuffer[int(0x0)].value[int(0x0) >> 2]), 0x1u, memory_order::memory_order_relaxed));
        u_xlatu0.x = mtl_ThreadID.x;
        BVHNodeListA[u_xlati1].value[(0x0 >> 2)] = u_xlatu0.x;
        BVHNodeListA[u_xlati1].value[(0x0 >> 2) + 1] = u_xlatu0.y;
    }
    return;
}
