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
    uint u_xlatu1;
    bool u_xlatb1;
    float4 u_xlat2;
    int4 u_xlati2;
    bool u_xlatb2;
    float4 u_xlat3;
    int4 u_xlati3;
    float4 u_xlat4;
    int4 u_xlati4;
    float4 u_xlat5;
    uint4 u_xlatu6;
    float4 u_xlat7;
    float3 u_xlat8;
    float4 u_xlat9;
    float4 u_xlat10;
    float4 u_xlat11;
    float4 u_xlat12;
    float4 u_xlat13;
    float4 u_xlat14;
    float3 u_xlat15;
    int3 u_xlati15;
    uint2 u_xlatu15;
    bool u_xlatb15;
    float u_xlat16;
    int u_xlati16;
    bool2 u_xlatb16;
    float u_xlat17;
    bool u_xlatb17;
    float3 u_xlat18;
    int u_xlati30;
    uint u_xlatu30;
    int u_xlati31;
    float u_xlat32;
    bool u_xlatb32;
    float u_xlat45;
    int u_xlati45;
    bool u_xlatb45;
    float u_xlat46;
    int u_xlati46;
    bool u_xlatb46;
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
    u_xlatu15.x = mtl_ThreadID.x & 0x1fu;
    u_xlatu0.xzw = uint3(BVHCulledClustersBuffer[u_xlatu0.x].value[(0x0 >> 2) + 0], BVHCulledClustersBuffer[u_xlatu0.x].value[(0x0 >> 2) + 1], BVHCulledClustersBuffer[u_xlatu0.x].value[(0x0 >> 2) + 2]);
    u_xlatb15 = u_xlatu15.x<u_xlatu0.w;
    if(u_xlatb15){
        u_xlat1 = float4(as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x0 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x0 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x0 >> 2) + 2]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x0 >> 2) + 3]));
        u_xlat2 = float4(as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x10 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x10 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x10 >> 2) + 2]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x10 >> 2) + 3]));
        u_xlat3 = float4(as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x20 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x20 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x20 >> 2) + 2]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x20 >> 2) + 3]));
        u_xlat4 = float4(as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x30 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x30 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x30 >> 2) + 2]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x30 >> 2) + 3]));
        u_xlat5.xyz = float3(as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x80 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x80 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x80 >> 2) + 2]));
        u_xlatu6.xz = uint2(InstanceDataBuffer[u_xlatu0.x].value[(0x90 >> 2) + 1], InstanceDataBuffer[u_xlatu0.x].value[(0x90 >> 2) + 0]);
        u_xlat7 = float4(as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x9c >> 2) + 2]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x9c >> 2) + 3]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x9c >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x9c >> 2) + 1]));
        u_xlat8.xyz = float3(as_type<float>(VGMeshBuffer[u_xlatu6.x].value[(0x14 >> 2) + 0]), as_type<float>(VGMeshBuffer[u_xlatu6.x].value[(0x14 >> 2) + 1]), as_type<float>(VGMeshBuffer[u_xlatu6.x].value[(0x14 >> 2) + 2]));
        u_xlati15.x = int(VGMeshBuffer[u_xlatu6.x].value[(0x24 >> 2) + 0]);
        u_xlati30 = int(u_xlatu0.z) + as_type<int>(u_xlat8.y);
        u_xlati30 = int(bitFieldInsert(0x1bu, 0x5u, uint(u_xlati30), mtl_ThreadID.x));
        u_xlati30 = int(ClusterGroupsBuffer[u_xlati30].value[(0x0 >> 2) + 0]);
        u_xlatu6.y = uint(u_xlati30) + as_type<uint>(u_xlat8.x);
        u_xlat9 = float4(as_type<float>(ClusterHeaderBuffer[u_xlatu6.y].value[(0x20 >> 2) + 0]), as_type<float>(ClusterHeaderBuffer[u_xlatu6.y].value[(0x20 >> 2) + 1]), as_type<float>(ClusterHeaderBuffer[u_xlatu6.y].value[(0x20 >> 2) + 2]), as_type<float>(ClusterHeaderBuffer[u_xlatu6.y].value[(0x20 >> 2) + 3]));
        u_xlati45 = int(ClusterHeaderBuffer[u_xlatu6.y].value[(0x40 >> 2) + 0]);
        u_xlat10.x = u_xlat1.x;
        u_xlat10.y = u_xlat2.x;
        u_xlat10.z = u_xlat3.x;
        u_xlat10.w = u_xlat4.x;
        u_xlat11.xyz = u_xlat9.xyz;
        u_xlat11.w = 1.0;
        u_xlat12.x = dot(u_xlat10, u_xlat11);
        u_xlat13.x = u_xlat1.y;
        u_xlat13.y = u_xlat2.y;
        u_xlat13.z = u_xlat3.y;
        u_xlat13.w = u_xlat4.y;
        u_xlat12.y = dot(u_xlat13, u_xlat11);
        u_xlat14.x = u_xlat1.z;
        u_xlat14.y = u_xlat2.z;
        u_xlat14.z = u_xlat3.z;
        u_xlat14.w = u_xlat4.z;
        u_xlat12.z = dot(u_xlat14, u_xlat11);
        u_xlat4.x = u_xlat1.w;
        u_xlat4.y = u_xlat2.w;
        u_xlat4.z = u_xlat3.w;
        u_xlat12.w = dot(u_xlat4, u_xlat11);
        u_xlat1.x = max(u_xlat5.y, u_xlat5.x);
        u_xlat1.x = max(u_xlat5.z, u_xlat1.x);
        u_xlat16 = u_xlat1.x * u_xlat9.w;
        u_xlati31 = int(as_type<uint>(u_xlat7.z) & 0x2u);
        u_xlati31 = int((u_xlati31!=0x0) ? 0xFFFFFFFFu : uint(0));
        u_xlat46 = dot(u_xlat12, _VGCBuffer._GPUFrustumPlanes[0]);
        u_xlatb46 = u_xlat46>=(-u_xlat16);
        u_xlat2.x = dot(u_xlat12, _VGCBuffer._GPUFrustumPlanes[1]);
        u_xlatb2 = u_xlat2.x>=(-u_xlat16);
        u_xlatb46 = u_xlatb46 && u_xlatb2;
        u_xlat2.x = dot(u_xlat12, _VGCBuffer._GPUFrustumPlanes[2]);
        u_xlatb2 = u_xlat2.x>=(-u_xlat16);
        u_xlatb46 = u_xlatb46 && u_xlatb2;
        u_xlat2.x = dot(u_xlat12, _VGCBuffer._GPUFrustumPlanes[3]);
        u_xlatb2 = u_xlat2.x>=(-u_xlat16);
        u_xlatb46 = u_xlatb46 && u_xlatb2;
        u_xlat2.x = dot(u_xlat12, _VGCBuffer._GPUFrustumPlanes[4]);
        u_xlatb2 = u_xlat2.x>=(-u_xlat16);
        u_xlatb46 = u_xlatb46 && u_xlatb2;
        u_xlat2.x = dot(u_xlat12, _VGCBuffer._GPUFrustumPlanes[5]);
        u_xlatb16.x = u_xlat2.x>=(-u_xlat16);
        u_xlatb16.x = u_xlatb16.x && u_xlatb46;
        u_xlati16 = int((uint(u_xlatb16.x) * 0xffffffffu) | uint(u_xlati31));
        u_xlatb46 = _VGCBuffer._DebugClusterLOD>=0x0;
        u_xlatb2 = 0x0<u_xlati15.x;
        u_xlatb46 = u_xlatb46 && u_xlatb2;
        if(u_xlatb46){
            u_xlati46 = max(u_xlati15.x, _VGCBuffer._DebugClusterLOD);
        } else {
            u_xlati46 = _VGCBuffer._DebugClusterLOD;
        }
        u_xlatb2 = u_xlati46>=0x0;
        if(u_xlatb2){
            u_xlatb46 = u_xlati45==u_xlati46;
            u_xlati46 = u_xlatb46 ? u_xlati16 : int(0);
        } else {
            u_xlati2.x = max(_VGCBuffer._GlobalMinLOD, 0x0);
            u_xlati15.x = max(u_xlati15.x, u_xlati2.x);
            u_xlatb2 = 0x0<u_xlati15.x;
            u_xlatb17 = u_xlati45<u_xlati15.x;
            u_xlatb17 = u_xlatb17 && u_xlatb2;
            if(u_xlatb17){
                u_xlati46 = 0x0;
            } else {
                u_xlat17 = as_type<float>(VGMeshBuffer[u_xlatu6.x].value[(0x2c >> 2) + 0]);
                u_xlat3 = float4(as_type<float>(ClusterHeaderBuffer[u_xlatu6.y].value[(0x0 >> 2) + 0]), as_type<float>(ClusterHeaderBuffer[u_xlatu6.y].value[(0x0 >> 2) + 1]), as_type<float>(ClusterHeaderBuffer[u_xlatu6.y].value[(0x0 >> 2) + 2]), as_type<float>(ClusterHeaderBuffer[u_xlatu6.y].value[(0x0 >> 2) + 3]));
                u_xlat4 = float4(as_type<float>(ClusterHeaderBuffer[u_xlatu6.y].value[(0x10 >> 2) + 0]), as_type<float>(ClusterHeaderBuffer[u_xlatu6.y].value[(0x10 >> 2) + 1]), as_type<float>(ClusterHeaderBuffer[u_xlatu6.y].value[(0x10 >> 2) + 2]), as_type<float>(ClusterHeaderBuffer[u_xlatu6.y].value[(0x10 >> 2) + 3]));
                u_xlatb32 = u_xlat3.w>=100000000.0;
                if(u_xlatb32){
                    u_xlat2.w = 100000000.0;
                }
                if(!u_xlatb32){
                    if((uint(_VGCBuffer._IsOrthographic))!=uint(0)){
                        u_xlat32 = u_xlat3.w * _VGCBuffer._CotHalfFov;
                        u_xlat32 = u_xlat1.x * u_xlat32;
                        u_xlat32 = u_xlat32 * _VGCBuffer._ScreenHeight;
                        u_xlat2.w = u_xlat32 * 0.5;
                    } else {
                        u_xlat5.xyz = u_xlat3.xyz;
                        u_xlat5.w = 1.0;
                        u_xlat3.x = dot(u_xlat10, u_xlat5);
                        u_xlat3.y = dot(u_xlat13, u_xlat5);
                        u_xlat3.z = dot(u_xlat14, u_xlat5);
                        u_xlat3.xyz = u_xlat3.xyz + (-_VGCBuffer._CameraWorldSpacePosition.xxyz.yzw);
                        u_xlat32 = dot(u_xlat3.xyz, u_xlat3.xyz);
                        u_xlat32 = fma((-u_xlat3.w), u_xlat3.w, u_xlat32);
                        u_xlat32 = max(u_xlat32, 0.0);
                        u_xlat32 = sqrt(u_xlat32);
                        u_xlat3.x = u_xlat3.w * _VGCBuffer._CotHalfFov;
                        u_xlat3.x = u_xlat1.x * u_xlat3.x;
                        u_xlat32 = u_xlat3.x / u_xlat32;
                        u_xlat32 = u_xlat32 * _VGCBuffer._ScreenHeight;
                        u_xlat2.w = u_xlat32 * 0.5;
                    }
                }
                u_xlatb32 = u_xlat4.w>=100000000.0;
                if(u_xlatb32){
                    u_xlat3.x = 100000000.0;
                }
                if(!u_xlatb32){
                    if((uint(_VGCBuffer._IsOrthographic))!=uint(0)){
                        u_xlat32 = u_xlat4.w * _VGCBuffer._CotHalfFov;
                        u_xlat32 = u_xlat1.x * u_xlat32;
                        u_xlat32 = u_xlat32 * _VGCBuffer._ScreenHeight;
                        u_xlat3.x = u_xlat32 * 0.5;
                    } else {
                        u_xlat5.xyz = u_xlat4.xyz;
                        u_xlat5.w = 1.0;
                        u_xlat4.x = dot(u_xlat10, u_xlat5);
                        u_xlat4.y = dot(u_xlat13, u_xlat5);
                        u_xlat4.z = dot(u_xlat14, u_xlat5);
                        u_xlat18.xyz = u_xlat4.xyz + (-_VGCBuffer._CameraWorldSpacePosition.xxyz.yzw);
                        u_xlat32 = dot(u_xlat18.xyz, u_xlat18.xyz);
                        u_xlat32 = fma((-u_xlat4.w), u_xlat4.w, u_xlat32);
                        u_xlat32 = max(u_xlat32, 0.0);
                        u_xlat32 = sqrt(u_xlat32);
                        u_xlat18.x = u_xlat4.w * _VGCBuffer._CotHalfFov;
                        u_xlat1.x = u_xlat1.x * u_xlat18.x;
                        u_xlat1.x = u_xlat1.x / u_xlat32;
                        u_xlat1.x = u_xlat1.x * _VGCBuffer._ScreenHeight;
                        u_xlat3.x = u_xlat1.x * 0.5;
                    }
                }
                u_xlat1.x = u_xlat3.x * u_xlat8.z;
                u_xlat32 = u_xlat2.w * u_xlat8.z;
                u_xlat17 = u_xlat17 * _VGCBuffer._ErrorThreshold;
                u_xlatb15 = u_xlati15.x==u_xlati45;
                u_xlatb15 = u_xlatb15 && u_xlatb2;
                u_xlatb45 = u_xlat17<u_xlat1.x;
                u_xlatb1 = u_xlat17>=u_xlat32;
                u_xlatb15 = u_xlatb15 || u_xlatb1;
                u_xlatb15 = u_xlatb45 && u_xlatb15;
                u_xlati46 = u_xlatb15 ? u_xlati16 : int(0);
            }
        }
        u_xlati15.x = ~(u_xlati31);
        u_xlati15.x = int(uint(u_xlati15.x) & uint(u_xlati46));
        u_xlatb45 = int(Globals._DisableSelfVisibilityCulling)==0x0;
        u_xlati15.x = u_xlatb45 ? u_xlati15.x : int(0);
        u_xlatb45 = as_type<int>(u_xlat7.w)!=int(0xffffffffu);
        u_xlati15.x = u_xlatb45 ? u_xlati15.x : int(0);
        if((uint(u_xlati15.x))!=uint(0)){
            u_xlat1.xyz = float3(as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x40 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x40 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x40 >> 2) + 2]));
            u_xlat2.xyz = float3(as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x50 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x50 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x50 >> 2) + 2]));
            u_xlat3.xyz = float3(as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x60 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x60 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x60 >> 2) + 2]));
            u_xlat4 = float4(as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0xac >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0xac >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0xac >> 2) + 2]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0xac >> 2) + 3]));
            u_xlat5.xyz = float3(as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0xbc >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0xbc >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0xbc >> 2) + 2]));
            u_xlat15.x = dot(_VGCBuffer._SelfVisibilityForwardDir.xyzx.xyz, _VGCBuffer._SelfVisibilityForwardDir.xyzx.xyz);
            u_xlatb15 = u_xlat15.x!=0.0;
            u_xlat8.xyz = (-u_xlat12.xyz) + _VGCBuffer._CameraWorldSpacePosition.xxyz.yzw;
            u_xlat45 = dot(u_xlat8.xyz, u_xlat8.xyz);
            u_xlat45 = rsqrt(u_xlat45);
            u_xlat8.xyz = float3(u_xlat45) * u_xlat8.xyz;
            u_xlat8.xyz = (bool(u_xlatb15)) ? (-_VGCBuffer._SelfVisibilityForwardDir.xyzx.xyz) : u_xlat8.xyz;
            u_xlat9.x = u_xlat1.x;
            u_xlat9.y = u_xlat2.x;
            u_xlat9.z = u_xlat3.x;
            u_xlat15.x = dot(u_xlat9.xyz, u_xlat8.xyz);
            u_xlat9.x = u_xlat1.y;
            u_xlat9.y = u_xlat2.y;
            u_xlat9.z = u_xlat3.y;
            u_xlat45 = dot(u_xlat9.xyz, u_xlat8.xyz);
            u_xlat3.x = u_xlat1.z;
            u_xlat3.y = u_xlat2.z;
            u_xlat1.x = dot(u_xlat3.xyz, u_xlat8.xyz);
            u_xlat7.z = u_xlat4.x;
            u_xlat2.xyz = float3(u_xlat45) * u_xlat4.yzw;
            u_xlat2.xyz = fma(u_xlat7.xyz, u_xlat15.xxx, u_xlat2.xyz);
            u_xlat1.xyz = fma(u_xlat5.xyz, u_xlat1.xxx, u_xlat2.xyz);
            u_xlat15.x = dot(u_xlat1.xyz, u_xlat1.xyz);
            u_xlat15.x = rsqrt(u_xlat15.x);
            u_xlat2.xyz = u_xlat15.xxx * u_xlat1.xyz;
            u_xlat2.w = max(u_xlat2.y, 0.00100000005);
            u_xlat15.x = dot(u_xlat2.xzw, u_xlat2.xzw);
            u_xlat15.x = rsqrt(u_xlat15.x);
            u_xlat1.xyz = u_xlat15.xxx * u_xlat2.xwz;
            u_xlat15.x = dot(float3(1.0, 1.0, 1.0), abs(u_xlat1.xyz));
            u_xlat15.xz = u_xlat1.xz / u_xlat15.xx;
            u_xlat1.x = u_xlat15.z + u_xlat15.x;
            u_xlat1.y = (-u_xlat15.z) + u_xlat15.x;
            u_xlat15.xz = u_xlat1.xy + float2(1.0, 1.0);
            u_xlat15.xz = u_xlat15.xz * float2(0.5, 0.5);
            u_xlat15.xz = clamp(u_xlat15.xz, 0.0f, 1.0f);
            u_xlati30 = u_xlati30 + as_type<int>(u_xlat7.w);
            u_xlati2 = int4(int(InstanceVisibilityBuffer[u_xlati30].value[(0x0 >> 2) + 0]), int(InstanceVisibilityBuffer[u_xlati30].value[(0x0 >> 2) + 1]), int(InstanceVisibilityBuffer[u_xlati30].value[(0x0 >> 2) + 2]), int(InstanceVisibilityBuffer[u_xlati30].value[(0x0 >> 2) + 3]));
            u_xlati3 = int4(int(InstanceVisibilityBuffer[u_xlati30].value[(0x10 >> 2) + 0]), int(InstanceVisibilityBuffer[u_xlati30].value[(0x10 >> 2) + 1]), int(InstanceVisibilityBuffer[u_xlati30].value[(0x10 >> 2) + 2]), int(InstanceVisibilityBuffer[u_xlati30].value[(0x10 >> 2) + 3]));
            u_xlat15.xy = u_xlat15.xz * float2(15.0, 15.0);
            u_xlat15.xy = floor(u_xlat15.xy);
            u_xlati15.xy = int2(u_xlat15.xy);
            u_xlatu15.xy = uint2(min(u_xlati15.xy, int2(0xe, 0xe)));
            u_xlati45 = int(bitFieldInsert(0x1u, 0x4u, u_xlatu15.y, 0x0u));
            u_xlati15.z = u_xlati45 + int(u_xlatu15.x);
            u_xlatu1 = u_xlatu15.y + 0x1u;
            u_xlati16 = int(bitFieldInsert(0x1u, 0x4u, u_xlatu1, 0x0u));
            u_xlati15.x = int(u_xlatu15.x) + u_xlati16;
            u_xlati15.xz = int2(0x3, 0x3) << u_xlati15.xz;
            u_xlati16 = int(u_xlatu15.y) >> 0x1;
            u_xlati16 = int(uint(u_xlati16) & 0x4u);
            u_xlati4 = (int(u_xlati16) != 0) ? u_xlati3 : u_xlati2;
            u_xlatu30 = bitFieldExtractU(0x2u, 0x1u, u_xlatu15.y);
            u_xlatb16.xy = (int2(u_xlatu30)==int2(0x1, 0x2));
            u_xlati31 = (u_xlatb16.y) ? u_xlati4.z : u_xlati4.w;
            u_xlati16 = (u_xlatb16.x) ? u_xlati4.y : u_xlati31;
            u_xlati30 = (u_xlatu30 != uint(0)) ? u_xlati16 : u_xlati4.x;
            u_xlati16 = int(u_xlatu1) >> 0x1;
            u_xlati16 = int(uint(u_xlati16) & 0x4u);
            u_xlati2 = (int(u_xlati16) != 0) ? u_xlati3 : u_xlati2;
            u_xlatu1 = bitFieldExtractU(0x2u, 0x1u, u_xlatu1);
            u_xlatb16.xy = (int2(u_xlatu1)==int2(0x1, 0x2));
            u_xlati31 = (u_xlatb16.y) ? u_xlati2.z : u_xlati2.w;
            u_xlati16 = (u_xlatb16.x) ? u_xlati2.y : u_xlati31;
            u_xlati1 = (u_xlatu1 != uint(0)) ? u_xlati16 : u_xlati2.x;
            u_xlati30 = int(uint(u_xlati15.z) & uint(u_xlati30));
            u_xlati15.x = int(uint(u_xlati15.x) & uint(u_xlati1));
            u_xlati15.x = int(uint(u_xlati15.x) | uint(u_xlati30));
            u_xlati46 = int((u_xlati15.x!=0x0) ? 0xFFFFFFFFu : uint(0));
        }
        if((uint(u_xlati46))!=uint(0)){
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
