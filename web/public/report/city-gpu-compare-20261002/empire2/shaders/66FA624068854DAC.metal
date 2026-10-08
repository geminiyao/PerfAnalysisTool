#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct Globals_Type
{
    uint _DisableSelfVisibilityCulling ;
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

struct ClusterHeaderBuffer_Type
{
    uint value[24];
};

struct InstanceDataBuffer_Type
{
    uint value[68];
};

struct VGMeshBuffer_Type
{
    uint value[12];
};

struct InstanceVisibilityBuffer_Type
{
    uint value[8];
};

struct ClusterGroupsBuffer_Type
{
    uint value[1];
};

struct BVHCulledClustersBuffer_Type
{
    uint value[3];
};

struct IndirectArgsBuffer_Type
{
    uint value[1];
};

struct CulledClusterList_Type
{
    uint value[4];
};

		template <typename UVecType> UVecType bitFieldInsert(const UVecType width, const UVecType offset, const UVecType src2, const UVecType src3)
		{
			UVecType bitmask = (((UVecType(1) << width)-1) << offset) & 0xffffffff;
			return ((src2 << offset) & bitmask) | (src3 & ~bitmask);
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
    constant Globals_Type& Globals [[ buffer(3) ]],
    constant _VGCBuffer_Type& _VGCBuffer [[ buffer(4) ]],
    const device ClusterHeaderBuffer_Type *ClusterHeaderBuffer [[ buffer(5) ]],
    const device InstanceDataBuffer_Type *InstanceDataBuffer [[ buffer(6) ]],
    const device VGMeshBuffer_Type *VGMeshBuffer [[ buffer(7) ]],
    const device InstanceVisibilityBuffer_Type *InstanceVisibilityBuffer [[ buffer(8) ]],
    const device ClusterGroupsBuffer_Type *ClusterGroupsBuffer [[ buffer(9) ]],
    const device BVHCulledClustersBuffer_Type *BVHCulledClustersBuffer [[ buffer(0) ]],
    device IndirectArgsBuffer_Type *IndirectArgsBuffer [[ buffer(1) ]],
    device CulledClusterList_Type *CulledClusterList [[ buffer(2) ]],
    uint3 mtl_ThreadIDInGroup [[ thread_position_in_threadgroup ]],
    uint3 mtl_ThreadID [[ thread_position_in_grid ]])
{
    ClusterHeaderBuffer = reinterpret_cast<const device ClusterHeaderBuffer_Type *> (reinterpret_cast<device const atomic_uint *> (ClusterHeaderBuffer) + 1);
    InstanceDataBuffer = reinterpret_cast<const device InstanceDataBuffer_Type *> (reinterpret_cast<device const atomic_uint *> (InstanceDataBuffer) + 1);
    VGMeshBuffer = reinterpret_cast<const device VGMeshBuffer_Type *> (reinterpret_cast<device const atomic_uint *> (VGMeshBuffer) + 1);
    InstanceVisibilityBuffer = reinterpret_cast<const device InstanceVisibilityBuffer_Type *> (reinterpret_cast<device const atomic_uint *> (InstanceVisibilityBuffer) + 1);
    ClusterGroupsBuffer = reinterpret_cast<const device ClusterGroupsBuffer_Type *> (reinterpret_cast<device const atomic_uint *> (ClusterGroupsBuffer) + 1);
    BVHCulledClustersBuffer = reinterpret_cast<const device BVHCulledClustersBuffer_Type *> (reinterpret_cast<device const atomic_uint *> (BVHCulledClustersBuffer) + 1);
    IndirectArgsBuffer = reinterpret_cast<device IndirectArgsBuffer_Type *> (reinterpret_cast<device atomic_uint *> (IndirectArgsBuffer) + 1);
    CulledClusterList = reinterpret_cast<device CulledClusterList_Type *> (reinterpret_cast<device atomic_uint *> (CulledClusterList) + 1);
    int u_xlati0;
    uint4 u_xlatu0;
    bool u_xlatb0;
    float4 u_xlat1;
    int u_xlati1;
    bool2 u_xlatb1;
    float4 u_xlat2;
    int4 u_xlati2;
    float4 u_xlat3;
    int4 u_xlati3;
    float4 u_xlat4;
    int4 u_xlati4;
    float3 u_xlat5;
    uint4 u_xlatu6;
    float4 u_xlat7;
    float4 u_xlat8;
    float4 u_xlat9;
    float4 u_xlat10;
    float4 u_xlat11;
    float u_xlat12;
    int3 u_xlati12;
    uint u_xlatu12;
    bool u_xlatb12;
    float u_xlat13;
    int u_xlati13;
    uint u_xlatu13;
    bool u_xlatb13;
    float2 u_xlat24;
    int2 u_xlati24;
    uint2 u_xlatu24;
    int u_xlati25;
    bool2 u_xlatb25;
    float u_xlat36;
    int u_xlati36;
    uint u_xlatu36;
    bool u_xlatb36;
    float u_xlat37;
    int u_xlati37;
    threadgroup uint TGSM0[1];
    if((mtl_ThreadIDInGroup.x)==uint(0)){
        u_xlati0 = int(IndirectArgsBuffer[0x3].value[(0x0 >> 2) + 0]);
        TGSM0[(0x0 >> 2)] = uint(u_xlati0);
    }
    threadgroup_barrier(mem_flags::mem_threadgroup);
    u_xlatu0.x = TGSM0[(0x0 >> 2) + 0];
    u_xlatb0 = mtl_ThreadID.x>=u_xlatu0.x;
    if(u_xlatb0){
        return;
    }
    u_xlatu0.x = mtl_ThreadID.x >> 0x5u;
    u_xlatu12 = mtl_ThreadID.x & 0x1fu;
    u_xlatu0.xzw = uint3(BVHCulledClustersBuffer[u_xlatu0.x].value[(0x0 >> 2) + 0], BVHCulledClustersBuffer[u_xlatu0.x].value[(0x0 >> 2) + 1], BVHCulledClustersBuffer[u_xlatu0.x].value[(0x0 >> 2) + 2]);
    u_xlatb12 = u_xlatu12<u_xlatu0.w;
    if(u_xlatb12){
        u_xlat1 = float4(as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x0 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x0 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x0 >> 2) + 2]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x0 >> 2) + 3]));
        u_xlat2 = float4(as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x10 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x10 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x10 >> 2) + 2]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x10 >> 2) + 3]));
        u_xlat3 = float4(as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x20 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x20 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x20 >> 2) + 2]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x20 >> 2) + 3]));
        u_xlat4 = float4(as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x30 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x30 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x30 >> 2) + 2]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x30 >> 2) + 3]));
        u_xlat5.xyz = float3(as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x80 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x80 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x80 >> 2) + 2]));
        u_xlatu6.xz = uint2(InstanceDataBuffer[u_xlatu0.x].value[(0x90 >> 2) + 1], InstanceDataBuffer[u_xlatu0.x].value[(0x90 >> 2) + 0]);
        u_xlat7 = float4(as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x9c >> 2) + 2]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x9c >> 2) + 3]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x9c >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x9c >> 2) + 1]));
        u_xlati12.xz = int2(int(VGMeshBuffer[u_xlatu6.x].value[(0x14 >> 2) + 0]), int(VGMeshBuffer[u_xlatu6.x].value[(0x14 >> 2) + 1]));
        u_xlati24.x = u_xlati12.z + int(u_xlatu0.z);
        u_xlati24.x = int(bitFieldInsert(0x1bu, 0x5u, uint(u_xlati24.x), mtl_ThreadID.x));
        u_xlati24.x = int(ClusterGroupsBuffer[u_xlati24.x].value[(0x0 >> 2) + 0]);
        u_xlatu6.y = uint(u_xlati24.x) + uint(u_xlati12.x);
        u_xlat8 = float4(as_type<float>(ClusterHeaderBuffer[u_xlatu6.y].value[(0x20 >> 2) + 0]), as_type<float>(ClusterHeaderBuffer[u_xlatu6.y].value[(0x20 >> 2) + 1]), as_type<float>(ClusterHeaderBuffer[u_xlatu6.y].value[(0x20 >> 2) + 2]), as_type<float>(ClusterHeaderBuffer[u_xlatu6.y].value[(0x20 >> 2) + 3]));
        u_xlat9.x = u_xlat1.x;
        u_xlat9.y = u_xlat2.x;
        u_xlat9.z = u_xlat3.x;
        u_xlat9.w = u_xlat4.x;
        u_xlat10.xyz = u_xlat8.xyz;
        u_xlat10.w = 1.0;
        u_xlat9.x = dot(u_xlat9, u_xlat10);
        u_xlat11.x = u_xlat1.y;
        u_xlat11.y = u_xlat2.y;
        u_xlat11.z = u_xlat3.y;
        u_xlat11.w = u_xlat4.y;
        u_xlat9.y = dot(u_xlat11, u_xlat10);
        u_xlat11.x = u_xlat1.z;
        u_xlat11.y = u_xlat2.z;
        u_xlat11.z = u_xlat3.z;
        u_xlat11.w = u_xlat4.z;
        u_xlat9.z = dot(u_xlat11, u_xlat10);
        u_xlat4.x = u_xlat1.w;
        u_xlat4.y = u_xlat2.w;
        u_xlat4.z = u_xlat3.w;
        u_xlat9.w = dot(u_xlat4, u_xlat10);
        u_xlat12 = max(u_xlat5.y, u_xlat5.x);
        u_xlat12 = max(u_xlat5.z, u_xlat12);
        u_xlat12 = u_xlat12 * u_xlat8.w;
        u_xlati36 = int(as_type<uint>(u_xlat7.z) & 0x2u);
        u_xlati36 = int((u_xlati36!=0x0) ? 0xFFFFFFFFu : uint(0));
        u_xlat1.x = dot(u_xlat9, _VGCBuffer._GPUFrustumPlanes[0]);
        u_xlat1.y = dot(u_xlat9, _VGCBuffer._GPUFrustumPlanes[1]);
        u_xlatb1.xy = (u_xlat1.xy>=(-float2(u_xlat12)));
        u_xlatb1.x = u_xlatb1.y && u_xlatb1.x;
        u_xlat13 = dot(u_xlat9, _VGCBuffer._GPUFrustumPlanes[2]);
        u_xlatb13 = u_xlat13>=(-u_xlat12);
        u_xlatb1.x = u_xlatb13 && u_xlatb1.x;
        u_xlat13 = dot(u_xlat9, _VGCBuffer._GPUFrustumPlanes[3]);
        u_xlatb13 = u_xlat13>=(-u_xlat12);
        u_xlatb1.x = u_xlatb13 && u_xlatb1.x;
        u_xlat13 = dot(u_xlat9, _VGCBuffer._GPUFrustumPlanes[4]);
        u_xlatb13 = u_xlat13>=(-u_xlat12);
        u_xlatb1.x = u_xlatb13 && u_xlatb1.x;
        u_xlat13 = dot(u_xlat9, _VGCBuffer._GPUFrustumPlanes[5]);
        u_xlatb12 = u_xlat13>=(-u_xlat12);
        u_xlatb12 = u_xlatb12 && u_xlatb1.x;
        u_xlati12.x = int((uint(u_xlatb12) * 0xffffffffu) | uint(u_xlati36));
        u_xlati36 = ~(u_xlati36);
        u_xlati36 = int(uint(u_xlati36) & uint(u_xlati12.x));
        u_xlatb1.x = int(Globals._DisableSelfVisibilityCulling)==0x0;
        u_xlati36 = u_xlatb1.x ? u_xlati36 : int(0);
        u_xlatb1.x = as_type<int>(u_xlat7.w)!=int(0xffffffffu);
        u_xlati36 = u_xlatb1.x ? u_xlati36 : int(0);
        if((uint(u_xlati36))!=uint(0)){
            u_xlat1.xyz = float3(as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x40 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x40 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x40 >> 2) + 2]));
            u_xlat2.xyz = float3(as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x50 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x50 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x50 >> 2) + 2]));
            u_xlat3.xyz = float3(as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x60 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x60 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x60 >> 2) + 2]));
            u_xlat4 = float4(as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0xac >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0xac >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0xac >> 2) + 2]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0xac >> 2) + 3]));
            u_xlat5.xyz = float3(as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0xbc >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0xbc >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0xbc >> 2) + 2]));
            u_xlat36 = dot(_VGCBuffer._SelfVisibilityForwardDir.xyzx.xyz, _VGCBuffer._SelfVisibilityForwardDir.xyzx.xyz);
            u_xlatb36 = u_xlat36!=0.0;
            u_xlat8.xyz = (-u_xlat9.xyz) + _VGCBuffer._CameraWorldSpacePosition.xxyz.yzw;
            u_xlat37 = dot(u_xlat8.xyz, u_xlat8.xyz);
            u_xlat37 = rsqrt(u_xlat37);
            u_xlat8.xyz = float3(u_xlat37) * u_xlat8.xyz;
            u_xlat8.xyz = (bool(u_xlatb36)) ? (-_VGCBuffer._SelfVisibilityForwardDir.xyzx.xyz) : u_xlat8.xyz;
            u_xlat9.x = u_xlat1.x;
            u_xlat9.y = u_xlat2.x;
            u_xlat9.z = u_xlat3.x;
            u_xlat36 = dot(u_xlat9.xyz, u_xlat8.xyz);
            u_xlat9.x = u_xlat1.y;
            u_xlat9.y = u_xlat2.y;
            u_xlat9.z = u_xlat3.y;
            u_xlat1.x = dot(u_xlat9.xyz, u_xlat8.xyz);
            u_xlat3.x = u_xlat1.z;
            u_xlat3.y = u_xlat2.z;
            u_xlat13 = dot(u_xlat3.xyz, u_xlat8.xyz);
            u_xlat7.z = u_xlat4.x;
            u_xlat1.xzw = u_xlat1.xxx * u_xlat4.yzw;
            u_xlat1.xzw = fma(u_xlat7.xyz, float3(u_xlat36), u_xlat1.xzw);
            u_xlat1.xyz = fma(u_xlat5.xyz, float3(u_xlat13), u_xlat1.xzw);
            u_xlat36 = dot(u_xlat1.xyz, u_xlat1.xyz);
            u_xlat36 = rsqrt(u_xlat36);
            u_xlat1.xyz = float3(u_xlat36) * u_xlat1.xyz;
            u_xlat1.w = max(u_xlat1.y, 0.00100000005);
            u_xlat36 = dot(u_xlat1.xzw, u_xlat1.xzw);
            u_xlat36 = rsqrt(u_xlat36);
            u_xlat1.xyz = float3(u_xlat36) * u_xlat1.xwz;
            u_xlat36 = dot(float3(1.0, 1.0, 1.0), abs(u_xlat1.xyz));
            u_xlat1.xy = u_xlat1.xz / float2(u_xlat36);
            u_xlat2.x = u_xlat1.y + u_xlat1.x;
            u_xlat2.y = (-u_xlat1.y) + u_xlat1.x;
            u_xlat1.xy = u_xlat2.xy + float2(1.0, 1.0);
            u_xlat1.xy = u_xlat1.xy * float2(0.5, 0.5);
            u_xlat1.xy = clamp(u_xlat1.xy, 0.0f, 1.0f);
            u_xlati24.x = u_xlati24.x + as_type<int>(u_xlat7.w);
            u_xlati2 = int4(int(InstanceVisibilityBuffer[u_xlati24.x].value[(0x0 >> 2) + 0]), int(InstanceVisibilityBuffer[u_xlati24.x].value[(0x0 >> 2) + 1]), int(InstanceVisibilityBuffer[u_xlati24.x].value[(0x0 >> 2) + 2]), int(InstanceVisibilityBuffer[u_xlati24.x].value[(0x0 >> 2) + 3]));
            u_xlati3 = int4(int(InstanceVisibilityBuffer[u_xlati24.x].value[(0x10 >> 2) + 0]), int(InstanceVisibilityBuffer[u_xlati24.x].value[(0x10 >> 2) + 1]), int(InstanceVisibilityBuffer[u_xlati24.x].value[(0x10 >> 2) + 2]), int(InstanceVisibilityBuffer[u_xlati24.x].value[(0x10 >> 2) + 3]));
            u_xlat24.xy = u_xlat1.xy * float2(15.0, 15.0);
            u_xlat24.xy = floor(u_xlat24.xy);
            u_xlati24.xy = int2(u_xlat24.xy);
            u_xlatu24.xy = uint2(min(u_xlati24.xy, int2(0xe, 0xe)));
            u_xlati1 = int(bitFieldInsert(0x1u, 0x4u, u_xlatu24.y, 0x0u));
            u_xlati1 = int(u_xlatu24.x) + u_xlati1;
            u_xlati1 = 0x3 << u_xlati1;
            u_xlatu13 = u_xlatu24.y + 0x1u;
            u_xlati25 = int(bitFieldInsert(0x1u, 0x4u, u_xlatu13, 0x0u));
            u_xlati24.x = int(u_xlatu24.x) + u_xlati25;
            u_xlati24.x = 0x3 << u_xlati24.x;
            u_xlati25 = int(u_xlatu24.y) >> 0x1;
            u_xlati25 = int(uint(u_xlati25) & 0x4u);
            u_xlati4 = (int(u_xlati25) != 0) ? u_xlati3 : u_xlati2;
            u_xlatu36 = bitFieldExtractU(0x2u, 0x1u, u_xlatu24.y);
            u_xlatb25.xy = (int2(u_xlatu36)==int2(0x1, 0x2));
            u_xlati37 = (u_xlatb25.y) ? u_xlati4.z : u_xlati4.w;
            u_xlati25 = (u_xlatb25.x) ? u_xlati4.y : u_xlati37;
            u_xlati36 = (u_xlatu36 != uint(0)) ? u_xlati25 : u_xlati4.x;
            u_xlati25 = int(u_xlatu13) >> 0x1;
            u_xlati25 = int(uint(u_xlati25) & 0x4u);
            u_xlati2 = (int(u_xlati25) != 0) ? u_xlati3 : u_xlati2;
            u_xlatu13 = bitFieldExtractU(0x2u, 0x1u, u_xlatu13);
            u_xlatb25.xy = (int2(u_xlatu13)==int2(0x1, 0x2));
            u_xlati37 = (u_xlatb25.y) ? u_xlati2.z : u_xlati2.w;
            u_xlati25 = (u_xlatb25.x) ? u_xlati2.y : u_xlati37;
            u_xlati13 = (u_xlatu13 != uint(0)) ? u_xlati25 : u_xlati2.x;
            u_xlati36 = int(uint(u_xlati1) & uint(u_xlati36));
            u_xlati24.x = int(uint(u_xlati24.x) & uint(u_xlati13));
            u_xlati24.x = int(uint(u_xlati24.x) | uint(u_xlati36));
            u_xlati12.x = int((u_xlati24.x!=0x0) ? 0xFFFFFFFFu : uint(0));
        }
        if((uint(u_xlati12.x))!=uint(0)){
            u_xlatu6.w = ClusterHeaderBuffer[u_xlatu6.y].value[(0x30 >> 2) + 0];
            u_xlati1 = int(atomic_fetch_add_explicit(reinterpret_cast<device atomic_uint *>(&IndirectArgsBuffer[int(0x8)].value[int(0x0) >> 2]), 0x1u, memory_order::memory_order_relaxed));
            u_xlatu6.x = u_xlatu0.x;
            CulledClusterList[u_xlati1].value[(0x0 >> 2)] = u_xlatu6.x;
            CulledClusterList[u_xlati1].value[(0x0 >> 2) + 1] = u_xlatu6.y;
            CulledClusterList[u_xlati1].value[(0x0 >> 2) + 2] = u_xlatu6.z;
            CulledClusterList[u_xlati1].value[(0x0 >> 2) + 3] = u_xlatu6.w;
        }
    }
    return;
}
