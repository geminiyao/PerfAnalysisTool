#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

constant float4 ImmCB_0[4] =
{
	float4(1.0, 0.0, 0.0, 0.0),
	float4(0.0, 1.0, 0.0, 0.0),
	float4(0.0, 0.0, 1.0, 0.0),
	float4(0.0, 0.0, 0.0, 1.0)
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

struct BVHNodesBuffer_Type
{
    uint value[48];
};

struct BVHNodeListA_Type
{
    uint value[2];
};

struct BVHNodeListB_Type
{
    uint value[2];
};

struct BVHCulledClustersBuffer_Type
{
    uint value[3];
};

struct IndirectArgsBuffer_Type
{
    uint value[1];
};

uint bitFieldExtractU(uint width, uint offset, uint src);
uint bitFieldExtractU(uint width, uint offset, uint src)
{
	bool isWidthZero = (width == 0);
	bool needsClamp = ((width + offset) < 32);
	uint clampVersion = src << (32-(width+offset));
	clampVersion = clampVersion >> (32 - width);
	uint simpleVersion = src >> offset;
	uint res = select(simpleVersion, clampVersion, needsClamp);
	return select(res, (uint)0, isWidthZero);
}; 
kernel void computeMain(
    constant _VGCBuffer_Type& _VGCBuffer [[ buffer(4) ]],
    const device InstanceDataBuffer_Type *InstanceDataBuffer [[ buffer(5) ]],
    const device VGMeshBuffer_Type *VGMeshBuffer [[ buffer(6) ]],
    const device BVHNodesBuffer_Type *BVHNodesBuffer [[ buffer(7) ]],
    device BVHNodeListA_Type *BVHNodeListA [[ buffer(0) ]],
    device BVHNodeListB_Type *BVHNodeListB [[ buffer(1) ]],
    device BVHCulledClustersBuffer_Type *BVHCulledClustersBuffer [[ buffer(2) ]],
    device IndirectArgsBuffer_Type *IndirectArgsBuffer [[ buffer(3) ]],
    uint3 mtl_ThreadID [[ thread_position_in_grid ]])
{
    InstanceDataBuffer = reinterpret_cast<const device InstanceDataBuffer_Type *> (reinterpret_cast<device const atomic_uint *> (InstanceDataBuffer) + 1);
    VGMeshBuffer = reinterpret_cast<const device VGMeshBuffer_Type *> (reinterpret_cast<device const atomic_uint *> (VGMeshBuffer) + 1);
    BVHNodesBuffer = reinterpret_cast<const device BVHNodesBuffer_Type *> (reinterpret_cast<device const atomic_uint *> (BVHNodesBuffer) + 1);
    BVHNodeListA = reinterpret_cast<device BVHNodeListA_Type *> (reinterpret_cast<device atomic_uint *> (BVHNodeListA) + 1);
    BVHNodeListB = reinterpret_cast<device BVHNodeListB_Type *> (reinterpret_cast<device atomic_uint *> (BVHNodeListB) + 1);
    BVHCulledClustersBuffer = reinterpret_cast<device BVHCulledClustersBuffer_Type *> (reinterpret_cast<device atomic_uint *> (BVHCulledClustersBuffer) + 1);
    IndirectArgsBuffer = reinterpret_cast<device IndirectArgsBuffer_Type *> (reinterpret_cast<device atomic_uint *> (IndirectArgsBuffer) + 1);
    float4 u_xlat0;
    int u_xlati0;
    uint u_xlatu0;
    bool u_xlatb0;
    uint u_xlatu1;
    int4 u_xlati2;
    uint u_xlatu2;
    float3 u_xlat3;
    int4 u_xlati3;
    bool4 u_xlatb3;
    float4 u_xlat4;
    bool4 u_xlatb4;
    float4 u_xlat5;
    int u_xlati5;
    float3 u_xlat6;
    float3 u_xlat7;
    float3 u_xlat8;
    float3 u_xlat9;
    float3 u_xlat10;
    int4 u_xlati11;
    float4 u_xlat12;
    float4 u_xlat13;
    float4 u_xlat14;
    float4 u_xlat15;
    float3 u_xlat16;
    float2 u_xlat17;
    int u_xlati17;
    uint u_xlatu17;
    bool2 u_xlatb17;
    int u_xlati18;
    uint u_xlatu18;
    bool u_xlatb18;
    bool u_xlatb20;
    float u_xlat34;
    bool u_xlatb34;
    float u_xlat35;
    int u_xlati35;
    uint u_xlatu35;
    bool u_xlatb35;
    int u_xlati36;
    int u_xlati52;
    uint u_xlatu52;
    int u_xlati54;
    threadgroup uint TGSM0[1];
    threadgroup uint TGSM1[1];
    threadgroup uint TGSM2[1];
    threadgroup uint TGSM3[1];
    threadgroup uint TGSM4[1];
    TGSM0[(0x0 >> 2)] = 0x0u;
    TGSM1[(0x0 >> 2)] = 0x0u;
    TGSM2[(0x0 >> 2)] = 0x0u;
    TGSM3[(0x0 >> 2)] = 0x0u;
    TGSM4[(0x0 >> 2)] = 0x0u;
    threadgroup_barrier(mem_flags::mem_threadgroup);
    if((mtl_ThreadID.x)==uint(0)){
        u_xlati0 = int(IndirectArgsBuffer[0x0].value[(0x0 >> 2) + 0]);
        TGSM2[(0x0 >> 2)] = uint(u_xlati0);
    }
    threadgroup_barrier(mem_flags::mem_threadgroup);
    u_xlat0.w = 1.0;
    u_xlatu1 = mtl_ThreadID.x;
    while(true){
        u_xlatu18 = TGSM2[(0x0 >> 2) + 0];
        u_xlatb35 = 0x0u>=u_xlatu18;
        if(u_xlatb35){break;}
        u_xlatu35 = TGSM1[(0x0 >> 2) + 0];
        u_xlati35 = int(u_xlatu35) << 0x2;
        u_xlatu35 = u_xlatu1 + uint(u_xlati35);
        u_xlatu52 = u_xlatu35 >> 0x2u;
        u_xlatb18 = u_xlatu52<u_xlatu18;
        u_xlatu2 = TGSM0[(0x0 >> 2) + 0];
        if(u_xlatb18){
            u_xlati18 = int(u_xlatu2 & 0x1u);
            u_xlati35 = int(u_xlatu35 & 0x3u);
            if((uint(u_xlati18))==uint(0)){
                u_xlati2.xy = int2(int(BVHNodeListA[u_xlatu52].value[(0x0 >> 2) + 0]), int(BVHNodeListA[u_xlatu52].value[(0x0 >> 2) + 1]));
            } else {
                u_xlati2.xy = int2(int(BVHNodeListB[u_xlatu52].value[(0x0 >> 2) + 0]), int(BVHNodeListB[u_xlatu52].value[(0x0 >> 2) + 1]));
            }
            u_xlati3 = int4(int(BVHNodesBuffer[u_xlati2.y].value[(0x80 >> 2) + 0]), int(BVHNodesBuffer[u_xlati2.y].value[(0x80 >> 2) + 1]), int(BVHNodesBuffer[u_xlati2.y].value[(0x80 >> 2) + 2]), int(BVHNodesBuffer[u_xlati2.y].value[(0x80 >> 2) + 3]));
            u_xlatb4 = (int4(u_xlati35)==int4(0x0, 0x1, 0x2, 0x3));
            u_xlati3 = int4((uint4(u_xlatb4) * 0xffffffffu) & uint4(u_xlati3));
            u_xlati3.xy = int2(uint2(u_xlati3.yw) | uint2(u_xlati3.xz));
            u_xlati52 = int(uint(u_xlati3.y) | uint(u_xlati3.x));
            u_xlatb3.x = u_xlati52==int(0xffffffffu);
            if(u_xlatb3.x){
                u_xlati3 = int4(int(BVHNodesBuffer[u_xlati2.y].value[(0x90 >> 2) + 0]), int(BVHNodesBuffer[u_xlati2.y].value[(0x90 >> 2) + 1]), int(BVHNodesBuffer[u_xlati2.y].value[(0x90 >> 2) + 2]), int(BVHNodesBuffer[u_xlati2.y].value[(0x90 >> 2) + 3]));
                u_xlati3 = int4((uint4(u_xlatb4) * 0xffffffffu) & uint4(u_xlati3));
                u_xlati3.xy = int2(uint2(u_xlati3.yw) | uint2(u_xlati3.xz));
                u_xlati2.z = int(uint(u_xlati3.y) | uint(u_xlati3.x));
                u_xlatb3.x = u_xlati2.z!=int(0xffffffffu);
                if(u_xlatb3.x){
                    u_xlati3 = int4(int(BVHNodesBuffer[u_xlati2.y].value[(0xb0 >> 2) + 0]), int(BVHNodesBuffer[u_xlati2.y].value[(0xb0 >> 2) + 1]), int(BVHNodesBuffer[u_xlati2.y].value[(0xb0 >> 2) + 2]), int(BVHNodesBuffer[u_xlati2.y].value[(0xb0 >> 2) + 3]));
                    u_xlati5 = int(InstanceDataBuffer[u_xlati2.x].value[(0x94 >> 2) + 0]);
                    u_xlati5 = int(VGMeshBuffer[u_xlati5].value[(0x28 >> 2) + 0]);
                    u_xlati3 = int4((uint4(u_xlatb4) * 0xffffffffu) & uint4(u_xlati3));
                    u_xlati3.x = int(uint(u_xlati3.y) | uint(u_xlati3.x));
                    u_xlati3.x = int(uint(u_xlati3.z) | uint(u_xlati3.x));
                    u_xlati3.x = int(uint(u_xlati3.w) | uint(u_xlati3.x));
                    u_xlatb20 = u_xlati3.x==int(0xffffffffu);
                    u_xlatb3.x = u_xlati5==u_xlati3.x;
                    u_xlatb3.x = u_xlatb3.x || u_xlatb20;
                    if(u_xlatb3.x){
                        u_xlati3 = int4(int(BVHNodesBuffer[u_xlati2.y].value[(0xa0 >> 2) + 0]), int(BVHNodesBuffer[u_xlati2.y].value[(0xa0 >> 2) + 1]), int(BVHNodesBuffer[u_xlati2.y].value[(0xa0 >> 2) + 2]), int(BVHNodesBuffer[u_xlati2.y].value[(0xa0 >> 2) + 3]));
                        u_xlati3 = int4((uint4(u_xlatb4) * 0xffffffffu) & uint4(u_xlati3));
                        u_xlati3.xy = int2(uint2(u_xlati3.yw) | uint2(u_xlati3.xz));
                        u_xlati2.y = int(uint(u_xlati3.y) | uint(u_xlati3.x));
                        u_xlati3.x = int(atomic_fetch_add_explicit(reinterpret_cast<threadgroup atomic_uint *>(&TGSM4[0x0 >> 2]), 0x1u, memory_order::memory_order_relaxed));
                        BVHCulledClustersBuffer[u_xlati3.x].value[(0x0 >> 2)] = uint(u_xlati2.x);
                        BVHCulledClustersBuffer[u_xlati3.x].value[(0x0 >> 2) + 1] = uint(u_xlati2.y);
                        BVHCulledClustersBuffer[u_xlati3.x].value[(0x0 >> 2) + 2] = uint(u_xlati2.z);
                    }
                }
            } else {
                u_xlat3.xyz = float3(as_type<float>(BVHNodesBuffer[u_xlati2.y].value[(0x0 >> 2) + 0]), as_type<float>(BVHNodesBuffer[u_xlati2.y].value[(0x0 >> 2) + 1]), as_type<float>(BVHNodesBuffer[u_xlati2.y].value[(0x0 >> 2) + 2]));
                u_xlat4.xyz = float3(as_type<float>(BVHNodesBuffer[u_xlati2.y].value[(0x10 >> 2) + 0]), as_type<float>(BVHNodesBuffer[u_xlati2.y].value[(0x10 >> 2) + 1]), as_type<float>(BVHNodesBuffer[u_xlati2.y].value[(0x10 >> 2) + 2]));
                u_xlat5.xyz = float3(as_type<float>(BVHNodesBuffer[u_xlati2.y].value[(0x20 >> 2) + 0]), as_type<float>(BVHNodesBuffer[u_xlati2.y].value[(0x20 >> 2) + 1]), as_type<float>(BVHNodesBuffer[u_xlati2.y].value[(0x20 >> 2) + 2]));
                u_xlat6.xyz = float3(as_type<float>(BVHNodesBuffer[u_xlati2.y].value[(0x30 >> 2) + 0]), as_type<float>(BVHNodesBuffer[u_xlati2.y].value[(0x30 >> 2) + 1]), as_type<float>(BVHNodesBuffer[u_xlati2.y].value[(0x30 >> 2) + 2]));
                u_xlat7.xyz = float3(as_type<float>(BVHNodesBuffer[u_xlati2.y].value[(0x40 >> 2) + 0]), as_type<float>(BVHNodesBuffer[u_xlati2.y].value[(0x40 >> 2) + 1]), as_type<float>(BVHNodesBuffer[u_xlati2.y].value[(0x40 >> 2) + 2]));
                u_xlat8.xyz = float3(as_type<float>(BVHNodesBuffer[u_xlati2.y].value[(0x50 >> 2) + 0]), as_type<float>(BVHNodesBuffer[u_xlati2.y].value[(0x50 >> 2) + 1]), as_type<float>(BVHNodesBuffer[u_xlati2.y].value[(0x50 >> 2) + 2]));
                u_xlat9.xyz = float3(as_type<float>(BVHNodesBuffer[u_xlati2.y].value[(0x60 >> 2) + 0]), as_type<float>(BVHNodesBuffer[u_xlati2.y].value[(0x60 >> 2) + 1]), as_type<float>(BVHNodesBuffer[u_xlati2.y].value[(0x60 >> 2) + 2]));
                u_xlat10.xyz = float3(as_type<float>(BVHNodesBuffer[u_xlati2.y].value[(0x70 >> 2) + 0]), as_type<float>(BVHNodesBuffer[u_xlati2.y].value[(0x70 >> 2) + 1]), as_type<float>(BVHNodesBuffer[u_xlati2.y].value[(0x70 >> 2) + 2]));
                u_xlati11 = int4(int(BVHNodesBuffer[u_xlati2.y].value[(0xb0 >> 2) + 0]), int(BVHNodesBuffer[u_xlati2.y].value[(0xb0 >> 2) + 1]), int(BVHNodesBuffer[u_xlati2.y].value[(0xb0 >> 2) + 2]), int(BVHNodesBuffer[u_xlati2.y].value[(0xb0 >> 2) + 3]));
                u_xlat12 = float4(as_type<float>(InstanceDataBuffer[u_xlati2.x].value[(0x0 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlati2.x].value[(0x0 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlati2.x].value[(0x0 >> 2) + 2]), as_type<float>(InstanceDataBuffer[u_xlati2.x].value[(0x0 >> 2) + 3]));
                u_xlat13 = float4(as_type<float>(InstanceDataBuffer[u_xlati2.x].value[(0x10 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlati2.x].value[(0x10 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlati2.x].value[(0x10 >> 2) + 2]), as_type<float>(InstanceDataBuffer[u_xlati2.x].value[(0x10 >> 2) + 3]));
                u_xlat14 = float4(as_type<float>(InstanceDataBuffer[u_xlati2.x].value[(0x20 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlati2.x].value[(0x20 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlati2.x].value[(0x20 >> 2) + 2]), as_type<float>(InstanceDataBuffer[u_xlati2.x].value[(0x20 >> 2) + 3]));
                u_xlat15 = float4(as_type<float>(InstanceDataBuffer[u_xlati2.x].value[(0x30 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlati2.x].value[(0x30 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlati2.x].value[(0x30 >> 2) + 2]), as_type<float>(InstanceDataBuffer[u_xlati2.x].value[(0x30 >> 2) + 3]));
                u_xlat16.xyz = float3(as_type<float>(InstanceDataBuffer[u_xlati2.x].value[(0x80 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlati2.x].value[(0x80 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlati2.x].value[(0x80 >> 2) + 2]));
                u_xlati36 = int(InstanceDataBuffer[u_xlati2.x].value[(0x94 >> 2) + 0]);
                u_xlati54 = int(InstanceDataBuffer[u_xlati2.x].value[(0x9c >> 2) + 0]);
                u_xlat4.xyz = u_xlat4.xyz * ImmCB_0[u_xlati35].yyy;
                u_xlat3.xyz = fma(u_xlat3.xyz, ImmCB_0[u_xlati35].xxx, u_xlat4.xyz);
                u_xlat3.xyz = fma(u_xlat5.xyz, ImmCB_0[u_xlati35].zzz, u_xlat3.xyz);
                u_xlat3.xyz = fma(u_xlat6.xyz, ImmCB_0[u_xlati35].www, u_xlat3.xyz);
                u_xlat4.xyz = u_xlat8.xyz * ImmCB_0[u_xlati35].yyy;
                u_xlat4.xyz = fma(u_xlat7.xyz, ImmCB_0[u_xlati35].xxx, u_xlat4.xyz);
                u_xlat4.xyz = fma(u_xlat9.xyz, ImmCB_0[u_xlati35].zzz, u_xlat4.xyz);
                u_xlat4.xyz = fma(u_xlat10.xyz, ImmCB_0[u_xlati35].www, u_xlat4.xyz);
                u_xlat5.xyz = u_xlat3.xyz + u_xlat4.xyz;
                u_xlat0.xyz = u_xlat5.xyz * float3(0.5, 0.5, 0.5);
                u_xlat3.xyz = (-u_xlat3.xyz) + u_xlat4.xyz;
                u_xlat35 = dot(u_xlat3.xyz, u_xlat3.xyz);
                u_xlat35 = sqrt(u_xlat35);
                u_xlat35 = u_xlat35 * 0.5;
                u_xlat3.x = max(u_xlat16.y, u_xlat16.x);
                u_xlat3.x = max(u_xlat16.z, u_xlat3.x);
                u_xlat35 = u_xlat35 * u_xlat3.x;
                u_xlat4.x = u_xlat12.x;
                u_xlat4.y = u_xlat13.x;
                u_xlat4.z = u_xlat14.x;
                u_xlat4.w = u_xlat15.x;
                u_xlat4.x = dot(u_xlat4, u_xlat0);
                u_xlat5.x = u_xlat12.y;
                u_xlat5.y = u_xlat13.y;
                u_xlat5.z = u_xlat14.y;
                u_xlat5.w = u_xlat15.y;
                u_xlat4.y = dot(u_xlat5, u_xlat0);
                u_xlat5.x = u_xlat12.z;
                u_xlat5.y = u_xlat13.z;
                u_xlat5.z = u_xlat14.z;
                u_xlat5.w = u_xlat15.z;
                u_xlat4.z = dot(u_xlat5, u_xlat0);
                u_xlat15.x = u_xlat12.w;
                u_xlat15.y = u_xlat13.w;
                u_xlat15.z = u_xlat14.w;
                u_xlat4.w = dot(u_xlat15, u_xlat0);
                u_xlati0 = int(uint(u_xlati54) & 0x2u);
                u_xlatb0 = u_xlati0!=0x0;
                u_xlat17.x = dot(u_xlat4, _VGCBuffer._GPUFrustumPlanes[0]);
                u_xlat17.y = dot(u_xlat4, _VGCBuffer._GPUFrustumPlanes[1]);
                u_xlatb17.xy = (u_xlat17.xy>=(-float2(u_xlat35)));
                u_xlatb17.x = u_xlatb17.y && u_xlatb17.x;
                u_xlat34 = dot(u_xlat4, _VGCBuffer._GPUFrustumPlanes[2]);
                u_xlatb34 = u_xlat34>=(-u_xlat35);
                u_xlatb17.x = u_xlatb34 && u_xlatb17.x;
                u_xlat34 = dot(u_xlat4, _VGCBuffer._GPUFrustumPlanes[3]);
                u_xlatb34 = u_xlat34>=(-u_xlat35);
                u_xlatb17.x = u_xlatb34 && u_xlatb17.x;
                u_xlat34 = dot(u_xlat4, _VGCBuffer._GPUFrustumPlanes[4]);
                u_xlatb34 = u_xlat34>=(-u_xlat35);
                u_xlatb17.x = u_xlatb34 && u_xlatb17.x;
                u_xlat34 = dot(u_xlat4, _VGCBuffer._GPUFrustumPlanes[5]);
                u_xlatb34 = u_xlat34>=(-u_xlat35);
                u_xlatb17.x = u_xlatb34 && u_xlatb17.x;
                u_xlatb0 = u_xlatb17.x || u_xlatb0;
                u_xlatb3 = (u_xlati11==int4(int(0xffffffffu), int(0xffffffffu), int(0xffffffffu), int(0xffffffffu)));
                u_xlatb17.x = u_xlatb3.y || u_xlatb3.x;
                u_xlatb17.x = u_xlatb3.z || u_xlatb17.x;
                u_xlatb17.x = u_xlatb3.w || u_xlatb17.x;
                if(!u_xlatb17.x){
                    u_xlati17 = int(VGMeshBuffer[u_xlati36].value[(0x28 >> 2) + 0]);
                    u_xlatb3 = (int4(u_xlati17)==u_xlati11);
                    u_xlatb17.x = u_xlatb3.y || u_xlatb3.x;
                    u_xlatb17.x = u_xlatb3.z || u_xlatb17.x;
                    u_xlati17 = int((uint(u_xlatb3.w) * 0xffffffffu) | (uint(u_xlatb17.x) * 0xffffffffu));
                } else {
                    u_xlati17 = int(0xffffffffu);
                }
                u_xlati0 = u_xlatb0 ? u_xlati17 : int(0);
                if((uint(u_xlati0))!=uint(0)){
                    u_xlati0 = int(VGMeshBuffer[u_xlati36].value[(0x10 >> 2) + 0]);
                    u_xlati3.x = int(atomic_fetch_add_explicit(reinterpret_cast<threadgroup atomic_uint *>(&TGSM3[0x0 >> 2]), 0x1u, memory_order::memory_order_relaxed));
                    if((uint(u_xlati18))==uint(0)){
                        u_xlati2.w = u_xlati52 + u_xlati0;
                        BVHNodeListB[u_xlati3.x].value[(0x0 >> 2)] = uint(u_xlati2.x);
                        BVHNodeListB[u_xlati3.x].value[(0x0 >> 2) + 1] = uint(u_xlati2.w);
                    } else {
                        u_xlati2.y = u_xlati52 + u_xlati0;
                        BVHNodeListA[u_xlati3.x].value[(0x0 >> 2)] = uint(u_xlati2.x);
                        BVHNodeListA[u_xlati3.x].value[(0x0 >> 2) + 1] = uint(u_xlati2.y);
                    }
                }
            }
        }
        threadgroup_barrier(mem_flags::mem_threadgroup);
        if((u_xlatu1)==uint(0)){
            u_xlatu0 = TGSM1[(0x0 >> 2) + 0];
            u_xlatu0 = u_xlatu0 + 0x100u;
            TGSM1[(0x0 >> 2)] = u_xlatu0;
            u_xlatu17 = TGSM2[(0x0 >> 2) + 0];
            u_xlatb0 = u_xlatu0>=u_xlatu17;
            if(u_xlatb0){
                TGSM1[(0x0 >> 2)] = 0x0u;
                u_xlatu0 = TGSM0[(0x0 >> 2) + 0];
                u_xlati0 = int(u_xlatu0) + 0x1;
                TGSM0[(0x0 >> 2)] = uint(u_xlati0);
                u_xlatu0 = TGSM3[(0x0 >> 2) + 0];
                TGSM2[(0x0 >> 2)] = u_xlatu0;
                TGSM3[(0x0 >> 2)] = 0x0u;
            }
        }
        threadgroup_barrier(mem_flags::mem_threadgroup);
    }
    if((mtl_ThreadID.x)==uint(0)){
        u_xlatu0 = TGSM4[(0x0 >> 2) + 0];
        u_xlati17 = int(u_xlatu0) << 0x5;
        IndirectArgsBuffer[0x3].value[(0x0 >> 2)] = uint(u_xlati17);
        u_xlatu0 = bitFieldExtractU(0x1au, 0x1u, u_xlatu0);
        u_xlati0 = int(u_xlatu0) + 0x1;
        IndirectArgsBuffer[0x4].value[(0x0 >> 2)] = uint(u_xlati0);
    }
    return;
}
