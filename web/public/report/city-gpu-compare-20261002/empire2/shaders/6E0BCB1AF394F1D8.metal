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
    int u_xlati0;
    uint u_xlatu0;
    float4 u_xlat1;
    int2 u_xlati1;
    uint u_xlatu1;
    bool u_xlatb1;
    float4 u_xlat2;
    bool2 u_xlatb2;
    uint2 u_xlatu3;
    int4 u_xlati4;
    uint u_xlatu4;
    float4 u_xlat5;
    int4 u_xlati5;
    bool u_xlatb5;
    float4 u_xlat6;
    int3 u_xlati6;
    bool4 u_xlatb6;
    float4 u_xlat7;
    int4 u_xlati7;
    bool4 u_xlatb7;
    float4 u_xlat8;
    float4 u_xlat9;
    float4 u_xlat10;
    float4 u_xlat11;
    float4 u_xlat12;
    float4 u_xlat13;
    float4 u_xlat14;
    int4 u_xlati14;
    float4 u_xlat15;
    float4 u_xlat16;
    float4 u_xlat17;
    float4 u_xlat18;
    float3 u_xlat19;
    int u_xlati20;
    float2 u_xlat21;
    int u_xlati21;
    uint u_xlatu21;
    bool2 u_xlatb21;
    float u_xlat22;
    int u_xlati22;
    bool u_xlatb22;
    int u_xlati23;
    bool u_xlatb23;
    float3 u_xlat25;
    int2 u_xlati25;
    uint u_xlatu25;
    bool u_xlatb25;
    uint u_xlatu40;
    float u_xlat41;
    int u_xlati41;
    bool u_xlatb41;
    int u_xlati42;
    bool u_xlatb42;
    int u_xlati43;
    uint u_xlatu43;
    bool2 u_xlatb43;
    int u_xlati44;
    float u_xlat45;
    int2 u_xlati45;
    bool u_xlatb45;
    uint u_xlatu60;
    int u_xlati63;
    uint u_xlatu63;
    float u_xlat64;
    int u_xlati64;
    bool u_xlatb64;
    bool u_xlatb65;
    int u_xlati67;
    uint u_xlatu68;
    bool u_xlatb69;
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
    u_xlati0 = max(_VGCBuffer._GlobalMinLOD, 0x0);
    u_xlat1.w = 1.0;
    u_xlat2.w = 1.0;
    u_xlati20 = _VGCBuffer._IsOrthographic;
    u_xlatu40 = uint(_VGCBuffer._DebugClusterLOD);
    u_xlatu60 = mtl_ThreadID.x;
    u_xlatu3.x = 0x1eu;
    while(true){
        u_xlatu3.y = TGSM2[(0x0 >> 2) + 0];
        u_xlatb43.xy = (uint2(0x0u, 0x0u)<u_xlatu3.yx);
        u_xlatb43.x = u_xlatb43.y && u_xlatb43.x;
        if(!u_xlatb43.x){break;}
        u_xlatu3.x = u_xlatu3.x + 0xffffffffu;
        u_xlatu43 = TGSM1[(0x0 >> 2) + 0];
        u_xlati43 = int(u_xlatu43) << 0x2;
        u_xlatu43 = u_xlatu60 + uint(u_xlati43);
        u_xlatu63 = u_xlatu43 >> 0x2u;
        u_xlatb23 = u_xlatu63<u_xlatu3.y;
        u_xlatu4 = TGSM0[(0x0 >> 2) + 0];
        if(u_xlatb23){
            u_xlati23 = int(u_xlatu4 & 0x1u);
            u_xlatu43 = u_xlatu43 & 0x3u;
            if((uint(u_xlati23))==uint(0)){
                u_xlati4.xy = int2(int(BVHNodeListA[u_xlatu63].value[(0x0 >> 2) + 0]), int(BVHNodeListA[u_xlatu63].value[(0x0 >> 2) + 1]));
            } else {
                u_xlati4.xy = int2(int(BVHNodeListB[u_xlatu63].value[(0x0 >> 2) + 0]), int(BVHNodeListB[u_xlatu63].value[(0x0 >> 2) + 1]));
            }
            u_xlati5 = int4(int(BVHNodesBuffer[u_xlati4.y].value[(0x80 >> 2) + 0]), int(BVHNodesBuffer[u_xlati4.y].value[(0x80 >> 2) + 1]), int(BVHNodesBuffer[u_xlati4.y].value[(0x80 >> 2) + 2]), int(BVHNodesBuffer[u_xlati4.y].value[(0x80 >> 2) + 3]));
            u_xlatb6 = (int4(u_xlatu43)==int4(0x0, 0x1, 0x2, 0x3));
            u_xlati5 = int4((uint4(u_xlatb6) * 0xffffffffu) & uint4(u_xlati5));
            u_xlati5.xy = int2(uint2(u_xlati5.yw) | uint2(u_xlati5.xz));
            u_xlati63 = int(uint(u_xlati5.y) | uint(u_xlati5.x));
            u_xlatb5 = u_xlati63==int(0xffffffffu);
            u_xlatb25 = int(u_xlatu40)>=0x0;
            if(u_xlatb25){
                if(u_xlatb5){
                    u_xlati7 = int4(int(BVHNodesBuffer[u_xlati4.y].value[(0x90 >> 2) + 0]), int(BVHNodesBuffer[u_xlati4.y].value[(0x90 >> 2) + 1]), int(BVHNodesBuffer[u_xlati4.y].value[(0x90 >> 2) + 2]), int(BVHNodesBuffer[u_xlati4.y].value[(0x90 >> 2) + 3]));
                    u_xlati25.x = int(InstanceDataBuffer[u_xlati4.x].value[(0x94 >> 2) + 0]);
                    u_xlatu25 = VGMeshBuffer[u_xlati25.x].value[(0x24 >> 2) + 0];
                    u_xlatb45 = 0x0<int(u_xlatu25);
                    if(u_xlatb45){
                        u_xlatu25 = max(u_xlatu40, u_xlatu25);
                    } else {
                        u_xlatu25 = u_xlatu40;
                    }
                    u_xlati7 = int4((uint4(u_xlatb6) * 0xffffffffu) & uint4(u_xlati7));
                    u_xlati45.xy = int2(uint2(u_xlati7.yw) | uint2(u_xlati7.xz));
                    u_xlati4.w = int(uint(u_xlati45.y) | uint(u_xlati45.x));
                    u_xlatb45 = u_xlati4.w!=int(0xffffffffu);
                    if(u_xlatb45){
                        u_xlati7 = int4(int(BVHNodesBuffer[u_xlati4.y].value[(0xb0 >> 2) + 0]), int(BVHNodesBuffer[u_xlati4.y].value[(0xb0 >> 2) + 1]), int(BVHNodesBuffer[u_xlati4.y].value[(0xb0 >> 2) + 2]), int(BVHNodesBuffer[u_xlati4.y].value[(0xb0 >> 2) + 3]));
                        u_xlati7 = int4((uint4(u_xlatb6) * 0xffffffffu) & uint4(u_xlati7));
                        u_xlati45.x = int(uint(u_xlati7.y) | uint(u_xlati7.x));
                        u_xlati45.x = int(uint(u_xlati7.z) | uint(u_xlati45.x));
                        u_xlati45.x = int(uint(u_xlati7.w) | uint(u_xlati45.x));
                        u_xlatb65 = u_xlati45.x==int(0xffffffffu);
                        u_xlatb25 = int(u_xlatu25)==u_xlati45.x;
                        u_xlatb25 = u_xlatb25 || u_xlatb65;
                        if(u_xlatb25){
                            u_xlati7 = int4(int(BVHNodesBuffer[u_xlati4.y].value[(0xa0 >> 2) + 0]), int(BVHNodesBuffer[u_xlati4.y].value[(0xa0 >> 2) + 1]), int(BVHNodesBuffer[u_xlati4.y].value[(0xa0 >> 2) + 2]), int(BVHNodesBuffer[u_xlati4.y].value[(0xa0 >> 2) + 3]));
                            u_xlati7 = int4((uint4(u_xlatb6) * 0xffffffffu) & uint4(u_xlati7));
                            u_xlati25.xy = int2(uint2(u_xlati7.yw) | uint2(u_xlati7.xz));
                            u_xlati4.z = int(uint(u_xlati25.y) | uint(u_xlati25.x));
                            u_xlati7.x = int(atomic_fetch_add_explicit(reinterpret_cast<threadgroup atomic_uint *>(&TGSM4[0x0 >> 2]), 0x1u, memory_order::memory_order_relaxed));
                            BVHCulledClustersBuffer[u_xlati7.x].value[(0x0 >> 2)] = uint(u_xlati4.x);
                            BVHCulledClustersBuffer[u_xlati7.x].value[(0x0 >> 2) + 1] = uint(u_xlati4.z);
                            BVHCulledClustersBuffer[u_xlati7.x].value[(0x0 >> 2) + 2] = uint(u_xlati4.w);
                        }
                    }
                } else {
                    u_xlat25.xyz = float3(as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x0 >> 2) + 0]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x0 >> 2) + 1]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x0 >> 2) + 2]));
                    u_xlat7.xyz = float3(as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x10 >> 2) + 0]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x10 >> 2) + 1]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x10 >> 2) + 2]));
                    u_xlat8.xyz = float3(as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x20 >> 2) + 0]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x20 >> 2) + 1]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x20 >> 2) + 2]));
                    u_xlat9.xyz = float3(as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x30 >> 2) + 0]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x30 >> 2) + 1]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x30 >> 2) + 2]));
                    u_xlat10.xyz = float3(as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x40 >> 2) + 0]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x40 >> 2) + 1]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x40 >> 2) + 2]));
                    u_xlat11.xyz = float3(as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x50 >> 2) + 0]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x50 >> 2) + 1]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x50 >> 2) + 2]));
                    u_xlat12.xyz = float3(as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x60 >> 2) + 0]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x60 >> 2) + 1]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x60 >> 2) + 2]));
                    u_xlat13.xyz = float3(as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x70 >> 2) + 0]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x70 >> 2) + 1]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x70 >> 2) + 2]));
                    u_xlati14 = int4(int(BVHNodesBuffer[u_xlati4.y].value[(0xb0 >> 2) + 0]), int(BVHNodesBuffer[u_xlati4.y].value[(0xb0 >> 2) + 1]), int(BVHNodesBuffer[u_xlati4.y].value[(0xb0 >> 2) + 2]), int(BVHNodesBuffer[u_xlati4.y].value[(0xb0 >> 2) + 3]));
                    u_xlat15 = float4(as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x0 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x0 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x0 >> 2) + 2]), as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x0 >> 2) + 3]));
                    u_xlat16 = float4(as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x10 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x10 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x10 >> 2) + 2]), as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x10 >> 2) + 3]));
                    u_xlat17 = float4(as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x20 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x20 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x20 >> 2) + 2]), as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x20 >> 2) + 3]));
                    u_xlat18 = float4(as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x30 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x30 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x30 >> 2) + 2]), as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x30 >> 2) + 3]));
                    u_xlat19.xyz = float3(as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x80 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x80 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x80 >> 2) + 2]));
                    u_xlati64 = int(InstanceDataBuffer[u_xlati4.x].value[(0x94 >> 2) + 0]);
                    u_xlati67 = int(InstanceDataBuffer[u_xlati4.x].value[(0x9c >> 2) + 0]);
                    u_xlatu68 = VGMeshBuffer[u_xlati64].value[(0x24 >> 2) + 0];
                    u_xlatb69 = 0x0<int(u_xlatu68);
                    if(u_xlatb69){
                        u_xlatu68 = max(u_xlatu40, u_xlatu68);
                    } else {
                        u_xlatu68 = u_xlatu40;
                    }
                    u_xlat7.xyz = u_xlat7.xyz * ImmCB_0[int(u_xlatu43)].yyy;
                    u_xlat25.xyz = fma(u_xlat25.xyz, ImmCB_0[int(u_xlatu43)].xxx, u_xlat7.xyz);
                    u_xlat25.xyz = fma(u_xlat8.xyz, ImmCB_0[int(u_xlatu43)].zzz, u_xlat25.xyz);
                    u_xlat25.xyz = fma(u_xlat9.xyz, ImmCB_0[int(u_xlatu43)].www, u_xlat25.xyz);
                    u_xlat7.xyz = u_xlat11.xyz * ImmCB_0[int(u_xlatu43)].yyy;
                    u_xlat7.xyz = fma(u_xlat10.xyz, ImmCB_0[int(u_xlatu43)].xxx, u_xlat7.xyz);
                    u_xlat7.xyz = fma(u_xlat12.xyz, ImmCB_0[int(u_xlatu43)].zzz, u_xlat7.xyz);
                    u_xlat7.xyz = fma(u_xlat13.xyz, ImmCB_0[int(u_xlatu43)].www, u_xlat7.xyz);
                    u_xlat8.xyz = u_xlat25.xyz + u_xlat7.xyz;
                    u_xlat1.xyz = u_xlat8.xyz * float3(0.5, 0.5, 0.5);
                    u_xlat25.xyz = (-u_xlat25.xyz) + u_xlat7.xyz;
                    u_xlat25.x = dot(u_xlat25.xyz, u_xlat25.xyz);
                    u_xlat25.x = sqrt(u_xlat25.x);
                    u_xlat25.x = u_xlat25.x * 0.5;
                    u_xlat45 = max(u_xlat19.y, u_xlat19.x);
                    u_xlat45 = max(u_xlat19.z, u_xlat45);
                    u_xlat25.x = u_xlat45 * u_xlat25.x;
                    u_xlat9.x = u_xlat15.x;
                    u_xlat9.y = u_xlat16.x;
                    u_xlat9.z = u_xlat17.x;
                    u_xlat9.w = u_xlat18.x;
                    u_xlat9.x = dot(u_xlat9, u_xlat1);
                    u_xlat10.x = u_xlat15.y;
                    u_xlat10.y = u_xlat16.y;
                    u_xlat10.z = u_xlat17.y;
                    u_xlat10.w = u_xlat18.y;
                    u_xlat9.y = dot(u_xlat10, u_xlat1);
                    u_xlat10.x = u_xlat15.z;
                    u_xlat10.y = u_xlat16.z;
                    u_xlat10.z = u_xlat17.z;
                    u_xlat10.w = u_xlat18.z;
                    u_xlat9.z = dot(u_xlat10, u_xlat1);
                    u_xlat18.x = u_xlat15.w;
                    u_xlat18.y = u_xlat16.w;
                    u_xlat18.z = u_xlat17.w;
                    u_xlat9.w = dot(u_xlat18, u_xlat1);
                    u_xlati1.x = int(uint(u_xlati67) & 0x2u);
                    u_xlatb1 = u_xlati1.x!=0x0;
                    u_xlat21.x = dot(u_xlat9, _VGCBuffer._GPUFrustumPlanes[0]);
                    u_xlat21.y = dot(u_xlat9, _VGCBuffer._GPUFrustumPlanes[1]);
                    u_xlatb21.xy = (u_xlat21.xy>=(-u_xlat25.xx));
                    u_xlatb21.x = u_xlatb21.y && u_xlatb21.x;
                    u_xlat41 = dot(u_xlat9, _VGCBuffer._GPUFrustumPlanes[2]);
                    u_xlatb41 = u_xlat41>=(-u_xlat25.x);
                    u_xlatb21.x = u_xlatb41 && u_xlatb21.x;
                    u_xlat41 = dot(u_xlat9, _VGCBuffer._GPUFrustumPlanes[3]);
                    u_xlatb41 = u_xlat41>=(-u_xlat25.x);
                    u_xlatb21.x = u_xlatb41 && u_xlatb21.x;
                    u_xlat41 = dot(u_xlat9, _VGCBuffer._GPUFrustumPlanes[4]);
                    u_xlatb41 = u_xlat41>=(-u_xlat25.x);
                    u_xlatb21.x = u_xlatb41 && u_xlatb21.x;
                    u_xlat41 = dot(u_xlat9, _VGCBuffer._GPUFrustumPlanes[5]);
                    u_xlatb41 = u_xlat41>=(-u_xlat25.x);
                    u_xlatb21.x = u_xlatb41 && u_xlatb21.x;
                    u_xlatb1 = u_xlatb21.x || u_xlatb1;
                    u_xlatb7 = (u_xlati14==int4(int(0xffffffffu), int(0xffffffffu), int(0xffffffffu), int(0xffffffffu)));
                    u_xlatb21.x = u_xlatb7.y || u_xlatb7.x;
                    u_xlatb21.x = u_xlatb7.z || u_xlatb21.x;
                    u_xlatb21.x = u_xlatb7.w || u_xlatb21.x;
                    if(!u_xlatb21.x){
                        u_xlatb7 = (int4(u_xlatu68)==u_xlati14);
                        u_xlatb21.x = u_xlatb7.y || u_xlatb7.x;
                        u_xlatb21.x = u_xlatb7.z || u_xlatb21.x;
                        u_xlati21 = int((uint(u_xlatb7.w) * 0xffffffffu) | (uint(u_xlatb21.x) * 0xffffffffu));
                    } else {
                        u_xlati21 = int(0xffffffffu);
                    }
                    u_xlati1.x = u_xlatb1 ? u_xlati21 : int(0);
                    if((uint(u_xlati1.x))!=uint(0)){
                        u_xlati1.x = int(VGMeshBuffer[u_xlati64].value[(0x10 >> 2) + 0]);
                        u_xlati7.x = int(atomic_fetch_add_explicit(reinterpret_cast<threadgroup atomic_uint *>(&TGSM3[0x0 >> 2]), 0x1u, memory_order::memory_order_relaxed));
                        if((uint(u_xlati23))==uint(0)){
                            u_xlati4.y = u_xlati63 + u_xlati1.x;
                            BVHNodeListB[u_xlati7.x].value[(0x0 >> 2)] = uint(u_xlati4.x);
                            BVHNodeListB[u_xlati7.x].value[(0x0 >> 2) + 1] = uint(u_xlati4.y);
                        } else {
                            u_xlati4.y = u_xlati63 + u_xlati1.x;
                            BVHNodeListA[u_xlati7.x].value[(0x0 >> 2)] = uint(u_xlati4.x);
                            BVHNodeListA[u_xlati7.x].value[(0x0 >> 2) + 1] = uint(u_xlati4.y);
                        }
                    }
                }
            } else {
                if(u_xlatb5){
                    u_xlati5 = int4(int(BVHNodesBuffer[u_xlati4.y].value[(0x90 >> 2) + 0]), int(BVHNodesBuffer[u_xlati4.y].value[(0x90 >> 2) + 1]), int(BVHNodesBuffer[u_xlati4.y].value[(0x90 >> 2) + 2]), int(BVHNodesBuffer[u_xlati4.y].value[(0x90 >> 2) + 3]));
                    u_xlati5 = int4((uint4(u_xlatb6) * 0xffffffffu) & uint4(u_xlati5));
                    u_xlati1.xy = int2(uint2(u_xlati5.yw) | uint2(u_xlati5.xz));
                    u_xlati4.z = int(uint(u_xlati1.y) | uint(u_xlati1.x));
                    u_xlatb1 = u_xlati4.z!=int(0xffffffffu);
                    if(u_xlatb1){
                        u_xlati5 = int4(int(BVHNodesBuffer[u_xlati4.y].value[(0xa0 >> 2) + 0]), int(BVHNodesBuffer[u_xlati4.y].value[(0xa0 >> 2) + 1]), int(BVHNodesBuffer[u_xlati4.y].value[(0xa0 >> 2) + 2]), int(BVHNodesBuffer[u_xlati4.y].value[(0xa0 >> 2) + 3]));
                        u_xlati5 = int4((uint4(u_xlatb6) * 0xffffffffu) & uint4(u_xlati5));
                        u_xlati1.xy = int2(uint2(u_xlati5.yw) | uint2(u_xlati5.xz));
                        u_xlati4.y = int(uint(u_xlati1.y) | uint(u_xlati1.x));
                        u_xlati5.x = int(atomic_fetch_add_explicit(reinterpret_cast<threadgroup atomic_uint *>(&TGSM4[0x0 >> 2]), 0x1u, memory_order::memory_order_relaxed));
                        BVHCulledClustersBuffer[u_xlati5.x].value[(0x0 >> 2)] = uint(u_xlati4.x);
                        BVHCulledClustersBuffer[u_xlati5.x].value[(0x0 >> 2) + 1] = uint(u_xlati4.y);
                        BVHCulledClustersBuffer[u_xlati5.x].value[(0x0 >> 2) + 2] = uint(u_xlati4.z);
                    }
                } else {
                    u_xlat5 = float4(as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x0 >> 2) + 0]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x0 >> 2) + 1]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x0 >> 2) + 2]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x0 >> 2) + 3]));
                    u_xlat6 = float4(as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x10 >> 2) + 0]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x10 >> 2) + 1]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x10 >> 2) + 2]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x10 >> 2) + 3]));
                    u_xlat7 = float4(as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x20 >> 2) + 0]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x20 >> 2) + 1]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x20 >> 2) + 2]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x20 >> 2) + 3]));
                    u_xlat8 = float4(as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x30 >> 2) + 0]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x30 >> 2) + 1]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x30 >> 2) + 2]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x30 >> 2) + 3]));
                    u_xlat9 = float4(as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x40 >> 2) + 0]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x40 >> 2) + 1]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x40 >> 2) + 2]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x40 >> 2) + 3]));
                    u_xlat10 = float4(as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x50 >> 2) + 0]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x50 >> 2) + 1]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x50 >> 2) + 2]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x50 >> 2) + 3]));
                    u_xlat11 = float4(as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x60 >> 2) + 0]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x60 >> 2) + 1]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x60 >> 2) + 2]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x60 >> 2) + 3]));
                    u_xlat12 = float4(as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x70 >> 2) + 0]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x70 >> 2) + 1]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x70 >> 2) + 2]), as_type<float>(BVHNodesBuffer[u_xlati4.y].value[(0x70 >> 2) + 3]));
                    u_xlat13 = float4(as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x0 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x0 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x0 >> 2) + 2]), as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x0 >> 2) + 3]));
                    u_xlat14 = float4(as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x10 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x10 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x10 >> 2) + 2]), as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x10 >> 2) + 3]));
                    u_xlat15 = float4(as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x20 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x20 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x20 >> 2) + 2]), as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x20 >> 2) + 3]));
                    u_xlat16 = float4(as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x30 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x30 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x30 >> 2) + 2]), as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x30 >> 2) + 3]));
                    u_xlat1.xyz = float3(as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x80 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x80 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlati4.x].value[(0x80 >> 2) + 2]));
                    u_xlati44 = int(InstanceDataBuffer[u_xlati4.x].value[(0x94 >> 2) + 0]);
                    u_xlat6 = u_xlat6 * ImmCB_0[int(u_xlatu43)].yyyy;
                    u_xlat5 = fma(u_xlat5, ImmCB_0[int(u_xlatu43)].xxxx, u_xlat6);
                    u_xlat5 = fma(u_xlat7, ImmCB_0[int(u_xlatu43)].zzzz, u_xlat5);
                    u_xlat5 = fma(u_xlat8, ImmCB_0[int(u_xlatu43)].wwww, u_xlat5);
                    u_xlat6 = u_xlat10 * ImmCB_0[int(u_xlatu43)].yyyy;
                    u_xlat6 = fma(u_xlat9, ImmCB_0[int(u_xlatu43)].xxxx, u_xlat6);
                    u_xlat6 = fma(u_xlat11, ImmCB_0[int(u_xlatu43)].zzzz, u_xlat6);
                    u_xlat6 = fma(u_xlat12, ImmCB_0[int(u_xlatu43)].wwww, u_xlat6);
                    u_xlat7.xyz = u_xlat5.xyz + u_xlat6.xyz;
                    u_xlat2.xyz = u_xlat7.xyz * float3(0.5, 0.5, 0.5);
                    u_xlat7.x = u_xlat13.x;
                    u_xlat7.y = u_xlat14.x;
                    u_xlat7.z = u_xlat15.x;
                    u_xlat7.w = u_xlat16.x;
                    u_xlat7.x = dot(u_xlat7, u_xlat2);
                    u_xlat8.x = u_xlat13.y;
                    u_xlat8.y = u_xlat14.y;
                    u_xlat8.z = u_xlat15.y;
                    u_xlat8.w = u_xlat16.y;
                    u_xlat7.y = dot(u_xlat8, u_xlat2);
                    u_xlat8.x = u_xlat13.z;
                    u_xlat8.y = u_xlat14.z;
                    u_xlat8.z = u_xlat15.z;
                    u_xlat8.w = u_xlat16.z;
                    u_xlat7.z = dot(u_xlat8, u_xlat2);
                    u_xlat8.xyz = u_xlat7.xyz + (-_VGCBuffer._CameraWorldSpacePosition.xxyz.yzw);
                    u_xlat64 = dot(u_xlat8.xyz, u_xlat8.xyz);
                    u_xlat64 = sqrt(u_xlat64);
                    u_xlat8.xyz = u_xlat8.xyz / float3(u_xlat64);
                    u_xlat5.xyz = (-u_xlat5.xyz) + u_xlat6.xyz;
                    u_xlat5.x = dot(u_xlat5.xyz, u_xlat5.xyz);
                    u_xlat5.x = sqrt(u_xlat5.x);
                    u_xlat5.x = u_xlat5.x * 0.5;
                    u_xlat1.x = max(u_xlat1.y, u_xlat1.x);
                    u_xlat1.x = max(u_xlat1.z, u_xlat1.x);
                    u_xlat21.x = u_xlat1.x * u_xlat5.x;
                    u_xlatb41 = u_xlat5.w>=100000000.0;
                    if(u_xlatb41){
                        u_xlat5.x = 100000000.0;
                    }
                    if(!u_xlatb41){
                        if((uint(u_xlati20))!=uint(0)){
                            u_xlat41 = u_xlat5.w * _VGCBuffer._CotHalfFov;
                            u_xlat41 = u_xlat1.x * u_xlat41;
                            u_xlat41 = u_xlat41 * _VGCBuffer._ScreenHeight;
                            u_xlat5.x = u_xlat41 * 0.5;
                        } else {
                            u_xlat6.xyz = fma(u_xlat8.xyz, u_xlat21.xxx, u_xlat7.xyz);
                            u_xlat6.xyz = u_xlat6.xyz + (-_VGCBuffer._CameraWorldSpacePosition.xxyz.yzw);
                            u_xlat41 = dot(u_xlat6.xyz, u_xlat6.xyz);
                            u_xlat41 = fma((-u_xlat5.w), u_xlat5.w, u_xlat41);
                            u_xlat41 = max(u_xlat41, 0.0);
                            u_xlat41 = sqrt(u_xlat41);
                            u_xlat25.x = u_xlat5.w * _VGCBuffer._CotHalfFov;
                            u_xlat5.y = u_xlat1.x * u_xlat25.x;
                            u_xlat41 = u_xlat5.y / u_xlat41;
                            u_xlat41 = u_xlat41 * _VGCBuffer._ScreenHeight;
                            u_xlat5.x = u_xlat41 * 0.5;
                        }
                    }
                    u_xlatb41 = u_xlat6.w>=100000000.0;
                    if(u_xlatb41){
                        u_xlat5.y = 100000000.0;
                    }
                    if(!u_xlatb41){
                        if((uint(u_xlati20))!=uint(0)){
                            u_xlat41 = u_xlat6.w * _VGCBuffer._CotHalfFov;
                            u_xlat41 = u_xlat1.x * u_xlat41;
                            u_xlat41 = u_xlat41 * _VGCBuffer._ScreenHeight;
                            u_xlat5.y = u_xlat41 * 0.5;
                        } else {
                            u_xlat6.xyz = fma((-u_xlat8.xyz), u_xlat21.xxx, u_xlat7.xyz);
                            u_xlatb41 = u_xlat64<u_xlat21.x;
                            u_xlat6.xyz = (bool(u_xlatb41)) ? _VGCBuffer._CameraWorldSpacePosition.xxyz.yzw : u_xlat6.xyz;
                            u_xlat6.xyz = u_xlat6.xyz + (-_VGCBuffer._CameraWorldSpacePosition.xxyz.yzw);
                            u_xlat41 = dot(u_xlat6.xyz, u_xlat6.xyz);
                            u_xlat41 = fma((-u_xlat6.w), u_xlat6.w, u_xlat41);
                            u_xlat41 = max(u_xlat41, 0.0);
                            u_xlat41 = sqrt(u_xlat41);
                            u_xlat64 = u_xlat6.w * _VGCBuffer._CotHalfFov;
                            u_xlat1.x = u_xlat1.x * u_xlat64;
                            u_xlat1.x = u_xlat1.x / u_xlat41;
                            u_xlat1.x = u_xlat1.x * _VGCBuffer._ScreenHeight;
                            u_xlat5.y = u_xlat1.x * 0.5;
                        }
                    }
                    u_xlati1.x = int(InstanceDataBuffer[u_xlati4.x].value[(0x9c >> 2) + 0]);
                    u_xlat41 = as_type<float>(VGMeshBuffer[u_xlati44].value[(0x1c >> 2) + 0]);
                    u_xlati64 = int(VGMeshBuffer[u_xlati44].value[(0x24 >> 2) + 0]);
                    u_xlat45 = as_type<float>(VGMeshBuffer[u_xlati44].value[(0x2c >> 2) + 0]);
                    u_xlat16.x = u_xlat13.w;
                    u_xlat16.y = u_xlat14.w;
                    u_xlat16.z = u_xlat15.w;
                    u_xlat7.w = dot(u_xlat16, u_xlat2);
                    u_xlati1.x = int(uint(u_xlati1.x) & 0x2u);
                    u_xlatb1 = u_xlati1.x!=0x0;
                    u_xlat2.x = dot(u_xlat7, _VGCBuffer._GPUFrustumPlanes[0]);
                    u_xlat2.y = dot(u_xlat7, _VGCBuffer._GPUFrustumPlanes[1]);
                    u_xlatb2.xy = (u_xlat2.xy>=(-u_xlat21.xx));
                    u_xlatb2.x = u_xlatb2.y && u_xlatb2.x;
                    u_xlat22 = dot(u_xlat7, _VGCBuffer._GPUFrustumPlanes[2]);
                    u_xlatb22 = u_xlat22>=(-u_xlat21.x);
                    u_xlatb2.x = u_xlatb22 && u_xlatb2.x;
                    u_xlat22 = dot(u_xlat7, _VGCBuffer._GPUFrustumPlanes[3]);
                    u_xlatb22 = u_xlat22>=(-u_xlat21.x);
                    u_xlatb2.x = u_xlatb22 && u_xlatb2.x;
                    u_xlat22 = dot(u_xlat7, _VGCBuffer._GPUFrustumPlanes[4]);
                    u_xlatb22 = u_xlat22>=(-u_xlat21.x);
                    u_xlatb2.x = u_xlatb22 && u_xlatb2.x;
                    u_xlat22 = dot(u_xlat7, _VGCBuffer._GPUFrustumPlanes[5]);
                    u_xlatb21.x = u_xlat22>=(-u_xlat21.x);
                    u_xlatb21.x = u_xlatb21.x && u_xlatb2.x;
                    u_xlati1.x = int((uint(u_xlatb21.x) * 0xffffffffu) | (uint(u_xlatb1) * 0xffffffffu));
                    u_xlat21.x = u_xlat41 * u_xlat5.x;
                    u_xlat41 = u_xlat41 * u_xlat5.y;
                    u_xlat2.x = u_xlat45 * _VGCBuffer._ErrorThreshold;
                    u_xlati22 = max(u_xlati0, u_xlati64);
                    u_xlatb42 = 0x0<u_xlati22;
                    if(u_xlatb42){
                        u_xlati5 = int4(int(BVHNodesBuffer[u_xlati4.y].value[(0xb0 >> 2) + 0]), int(BVHNodesBuffer[u_xlati4.y].value[(0xb0 >> 2) + 1]), int(BVHNodesBuffer[u_xlati4.y].value[(0xb0 >> 2) + 2]), int(BVHNodesBuffer[u_xlati4.y].value[(0xb0 >> 2) + 3]));
                        u_xlati42 = 0 - int(u_xlatu43);
                        u_xlati6.xyz = int3(uint3((uint3(u_xlatu43)<uint3(0x1u, 0x2u, 0x3u))) * 0xFFFFFFFFu);
                        u_xlati7.y = int(uint(u_xlati42) & uint(u_xlati6.y));
                        u_xlati42 = int(u_xlatu43) + int(0xfffffffdu);
                        u_xlati7.z = (u_xlati6.y != 0) ? 0x0 : u_xlati42;
                        u_xlati7.w = int((u_xlati6.z==0x0) ? 0xFFFFFFFFu : uint(0));
                        u_xlati7.x = u_xlati6.x;
                        u_xlati5 = int4(uint4(u_xlati5) & uint4(u_xlati7));
                        u_xlati5.xy = int2(uint2(u_xlati5.yw) | uint2(u_xlati5.xz));
                        u_xlati42 = int(uint(u_xlati5.y) | uint(u_xlati5.x));
                        u_xlatb43.x = u_xlati42>=0x0;
                        u_xlatb64 = u_xlati42<u_xlati22;
                        u_xlatb43.x = u_xlatb43.x && u_xlatb64;
                        if(u_xlatb43.x){
                            u_xlati1.x = 0x0;
                        } else {
                            u_xlatb43.x = u_xlati42<0x0;
                            if(!u_xlatb43.x){
                                u_xlatb22 = u_xlati22==u_xlati42;
                                if(u_xlatb22){
                                    u_xlatb22 = u_xlat2.x<u_xlat41;
                                    u_xlati1.x = u_xlatb22 ? u_xlati1.x : int(0);
                                } else {
                                    u_xlatb22 = u_xlat2.x<u_xlat41;
                                    u_xlati22 = u_xlatb22 ? u_xlati1.x : int(0);
                                    u_xlatb42 = u_xlat2.x>=u_xlat21.x;
                                    u_xlati1.x = u_xlatb42 ? u_xlati22 : int(0);
                                }
                            }
                        }
                    } else {
                        u_xlatb41 = u_xlat2.x<u_xlat41;
                        u_xlati41 = u_xlatb41 ? u_xlati1.x : int(0);
                        u_xlatb21.x = u_xlat2.x>=u_xlat21.x;
                        u_xlati1.x = u_xlatb21.x ? u_xlati41 : int(0);
                    }
                    if((uint(u_xlati1.x))!=uint(0)){
                        u_xlati1.x = int(VGMeshBuffer[u_xlati44].value[(0x10 >> 2) + 0]);
                        u_xlati5.x = int(atomic_fetch_add_explicit(reinterpret_cast<threadgroup atomic_uint *>(&TGSM3[0x0 >> 2]), 0x1u, memory_order::memory_order_relaxed));
                        if((uint(u_xlati23))==uint(0)){
                            u_xlati4.y = u_xlati63 + u_xlati1.x;
                            BVHNodeListB[u_xlati5.x].value[(0x0 >> 2)] = uint(u_xlati4.x);
                            BVHNodeListB[u_xlati5.x].value[(0x0 >> 2) + 1] = uint(u_xlati4.y);
                        } else {
                            u_xlati4.y = u_xlati63 + u_xlati1.x;
                            BVHNodeListA[u_xlati5.x].value[(0x0 >> 2)] = uint(u_xlati4.x);
                            BVHNodeListA[u_xlati5.x].value[(0x0 >> 2) + 1] = uint(u_xlati4.y);
                        }
                    }
                }
            }
        }
        threadgroup_barrier(mem_flags::mem_threadgroup);
        if((u_xlatu60)==uint(0)){
            u_xlatu1 = TGSM1[(0x0 >> 2) + 0];
            u_xlatu1 = u_xlatu1 + 0x80u;
            TGSM1[(0x0 >> 2)] = u_xlatu1;
            u_xlatu21 = TGSM2[(0x0 >> 2) + 0];
            u_xlatb1 = u_xlatu1>=u_xlatu21;
            if(u_xlatb1){
                TGSM1[(0x0 >> 2)] = 0x0u;
                u_xlatu1 = TGSM0[(0x0 >> 2) + 0];
                u_xlati1.x = int(u_xlatu1) + 0x1;
                TGSM0[(0x0 >> 2)] = uint(u_xlati1.x);
                u_xlatu1 = TGSM3[(0x0 >> 2) + 0];
                TGSM2[(0x0 >> 2)] = u_xlatu1;
                TGSM3[(0x0 >> 2)] = 0x0u;
            }
        }
        threadgroup_barrier(mem_flags::mem_threadgroup);
    }
    if((mtl_ThreadID.x)==uint(0)){
        u_xlatu0 = TGSM4[(0x0 >> 2) + 0];
        u_xlati20 = int(u_xlatu0) << 0x5;
        IndirectArgsBuffer[0x3].value[(0x0 >> 2)] = uint(u_xlati20);
        u_xlatu0 = bitFieldExtractU(0x1au, 0x1u, u_xlatu0);
        u_xlati0 = int(u_xlatu0) + 0x1;
        IndirectArgsBuffer[0x4].value[(0x0 >> 2)] = uint(u_xlati0);
    }
    return;
}
