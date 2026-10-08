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

struct _VGDirtyRegionCBuffer_Type
{
    uint _DirtyBoundsCount ;
    float4 hlslcc_mtx4x4_DirtyLightViewMatrix [4];
    float4 _DirtyBounds [20];
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
    constant _VGDirtyRegionCBuffer_Type& _VGDirtyRegionCBuffer [[ buffer(5) ]],
    const device ClusterHeaderBuffer_Type *ClusterHeaderBuffer [[ buffer(6) ]],
    const device InstanceDataBuffer_Type *InstanceDataBuffer [[ buffer(7) ]],
    const device VGMeshBuffer_Type *VGMeshBuffer [[ buffer(8) ]],
    const device InstanceVisibilityBuffer_Type *InstanceVisibilityBuffer [[ buffer(9) ]],
    const device ClusterGroupsBuffer_Type *ClusterGroupsBuffer [[ buffer(10) ]],
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
    bool u_xlatb1;
    float4 u_xlat2;
    int u_xlati2;
    uint2 u_xlatu2;
    bool u_xlatb2;
    float4 u_xlat3;
    int4 u_xlati3;
    uint2 u_xlatu3;
    bool u_xlatb3;
    float4 u_xlat4;
    int4 u_xlati4;
    float4 u_xlat5;
    int4 u_xlati5;
    bool u_xlatb5;
    uint4 u_xlatu6;
    float4 u_xlat7;
    float3 u_xlat8;
    float4 u_xlat9;
    float4 u_xlat10;
    float4 u_xlat11;
    float4 u_xlat12;
    float4 u_xlat13;
    float4 u_xlat14;
    float2 u_xlat15;
    int u_xlati15;
    uint u_xlatu15;
    bool u_xlatb15;
    float u_xlat16;
    bool u_xlatb17;
    float u_xlat18;
    float2 u_xlat30;
    int2 u_xlati30;
    uint2 u_xlatu30;
    float u_xlat31;
    int u_xlati31;
    uint u_xlatu31;
    float u_xlat32;
    int u_xlati32;
    bool2 u_xlatb32;
    float u_xlat33;
    float u_xlat45;
    int u_xlati45;
    uint u_xlatu45;
    bool u_xlatb45;
    float u_xlat46;
    int u_xlati46;
    bool u_xlatb46;
    float u_xlat47;
    bool u_xlatb47;
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
    u_xlatu15 = mtl_ThreadID.x & 0x1fu;
    u_xlatu0.xzw = uint3(BVHCulledClustersBuffer[u_xlatu0.x].value[(0x0 >> 2) + 0], BVHCulledClustersBuffer[u_xlatu0.x].value[(0x0 >> 2) + 1], BVHCulledClustersBuffer[u_xlatu0.x].value[(0x0 >> 2) + 2]);
    u_xlatb15 = u_xlatu15<u_xlatu0.w;
    if(u_xlatb15){
        u_xlat1 = float4(as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x0 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x0 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x0 >> 2) + 2]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x0 >> 2) + 3]));
        u_xlat2 = float4(as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x10 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x10 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x10 >> 2) + 2]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x10 >> 2) + 3]));
        u_xlat3 = float4(as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x20 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x20 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x20 >> 2) + 2]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x20 >> 2) + 3]));
        u_xlat4 = float4(as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x30 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x30 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x30 >> 2) + 2]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x30 >> 2) + 3]));
        u_xlat5.xyz = float3(as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x80 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x80 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x80 >> 2) + 2]));
        u_xlatu6.xz = uint2(InstanceDataBuffer[u_xlatu0.x].value[(0x90 >> 2) + 1], InstanceDataBuffer[u_xlatu0.x].value[(0x90 >> 2) + 0]);
        u_xlat7 = float4(as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x9c >> 2) + 2]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x9c >> 2) + 3]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x9c >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x9c >> 2) + 1]));
        u_xlat8.xyz = float3(as_type<float>(VGMeshBuffer[u_xlatu6.x].value[(0x14 >> 2) + 0]), as_type<float>(VGMeshBuffer[u_xlatu6.x].value[(0x14 >> 2) + 1]), as_type<float>(VGMeshBuffer[u_xlatu6.x].value[(0x14 >> 2) + 2]));
        u_xlati15 = int(VGMeshBuffer[u_xlatu6.x].value[(0x24 >> 2) + 0]);
        u_xlati30.x = int(u_xlatu0.z) + as_type<int>(u_xlat8.y);
        u_xlati30.x = int(bitFieldInsert(0x1bu, 0x5u, uint(u_xlati30.x), mtl_ThreadID.x));
        u_xlati30.x = int(ClusterGroupsBuffer[u_xlati30.x].value[(0x0 >> 2) + 0]);
        u_xlatu6.y = uint(u_xlati30.x) + as_type<uint>(u_xlat8.x);
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
        u_xlatb2 = u_xlat2.x>=(-u_xlat16);
        u_xlatb46 = u_xlatb46 && u_xlatb2;
        u_xlati46 = int((uint(u_xlatb46) * 0xffffffffu) | uint(u_xlati31));
        u_xlatb2 = _VGCBuffer._DebugClusterLOD>=0x0;
        u_xlatb17 = 0x0<u_xlati15;
        u_xlatb2 = u_xlatb17 && u_xlatb2;
        if(u_xlatb2){
            u_xlati2 = max(u_xlati15, _VGCBuffer._DebugClusterLOD);
        } else {
            u_xlati2 = _VGCBuffer._DebugClusterLOD;
        }
        u_xlatb17 = u_xlati2>=0x0;
        if(u_xlatb17){
            u_xlatb2 = u_xlati45==u_xlati2;
            u_xlatu2.x = u_xlatb2 ? uint(u_xlati46) : uint(0);
        } else {
            u_xlati32 = max(_VGCBuffer._GlobalMinLOD, 0x0);
            u_xlati15 = max(u_xlati15, u_xlati32);
            u_xlatb32.x = 0x0<u_xlati15;
            u_xlatb47 = u_xlati45<u_xlati15;
            u_xlatb47 = u_xlatb47 && u_xlatb32.x;
            if(u_xlatb47){
                u_xlatu2.x = 0x0u;
            } else {
                u_xlat47 = as_type<float>(VGMeshBuffer[u_xlatu6.x].value[(0x2c >> 2) + 0]);
                u_xlat3 = float4(as_type<float>(ClusterHeaderBuffer[u_xlatu6.y].value[(0x0 >> 2) + 0]), as_type<float>(ClusterHeaderBuffer[u_xlatu6.y].value[(0x0 >> 2) + 1]), as_type<float>(ClusterHeaderBuffer[u_xlatu6.y].value[(0x0 >> 2) + 2]), as_type<float>(ClusterHeaderBuffer[u_xlatu6.y].value[(0x0 >> 2) + 3]));
                u_xlat4 = float4(as_type<float>(ClusterHeaderBuffer[u_xlatu6.y].value[(0x10 >> 2) + 0]), as_type<float>(ClusterHeaderBuffer[u_xlatu6.y].value[(0x10 >> 2) + 1]), as_type<float>(ClusterHeaderBuffer[u_xlatu6.y].value[(0x10 >> 2) + 2]), as_type<float>(ClusterHeaderBuffer[u_xlatu6.y].value[(0x10 >> 2) + 3]));
                u_xlatb5 = u_xlat3.w>=100000000.0;
                if(u_xlatb5){
                    u_xlat5.y = 100000000.0;
                }
                if(!u_xlatb5){
                    if((uint(_VGCBuffer._IsOrthographic))!=uint(0)){
                        u_xlat5.x = u_xlat3.w * _VGCBuffer._CotHalfFov;
                        u_xlat5.x = u_xlat1.x * u_xlat5.x;
                        u_xlat5.x = u_xlat5.x * _VGCBuffer._ScreenHeight;
                        u_xlat5.y = u_xlat5.x * 0.5;
                    } else {
                        u_xlat9.xyz = u_xlat3.xyz;
                        u_xlat9.w = 1.0;
                        u_xlat3.x = dot(u_xlat10, u_xlat9);
                        u_xlat3.y = dot(u_xlat13, u_xlat9);
                        u_xlat3.z = dot(u_xlat14, u_xlat9);
                        u_xlat3.xyz = u_xlat3.xyz + (-_VGCBuffer._CameraWorldSpacePosition.xxyz.yzw);
                        u_xlat3.x = dot(u_xlat3.xyz, u_xlat3.xyz);
                        u_xlat3.x = fma((-u_xlat3.w), u_xlat3.w, u_xlat3.x);
                        u_xlat3.x = max(u_xlat3.x, 0.0);
                        u_xlat3.x = sqrt(u_xlat3.x);
                        u_xlat18 = u_xlat3.w * _VGCBuffer._CotHalfFov;
                        u_xlat3.y = u_xlat1.x * u_xlat18;
                        u_xlat3.x = u_xlat3.y / u_xlat3.x;
                        u_xlat3.x = u_xlat3.x * _VGCBuffer._ScreenHeight;
                        u_xlat5.y = u_xlat3.x * 0.5;
                    }
                }
                u_xlatb3 = u_xlat4.w>=100000000.0;
                if(u_xlatb3){
                    u_xlat3.y = 100000000.0;
                }
                if(!u_xlatb3){
                    if((uint(_VGCBuffer._IsOrthographic))!=uint(0)){
                        u_xlat3.x = u_xlat4.w * _VGCBuffer._CotHalfFov;
                        u_xlat3.x = u_xlat1.x * u_xlat3.x;
                        u_xlat3.x = u_xlat3.x * _VGCBuffer._ScreenHeight;
                        u_xlat3.y = u_xlat3.x * 0.5;
                    } else {
                        u_xlat9.xyz = u_xlat4.xyz;
                        u_xlat9.w = 1.0;
                        u_xlat4.x = dot(u_xlat10, u_xlat9);
                        u_xlat4.y = dot(u_xlat13, u_xlat9);
                        u_xlat4.z = dot(u_xlat14, u_xlat9);
                        u_xlat3.xzw = u_xlat4.xyz + (-_VGCBuffer._CameraWorldSpacePosition.xxyz.yzw);
                        u_xlat3.x = dot(u_xlat3.xzw, u_xlat3.xzw);
                        u_xlat3.x = fma((-u_xlat4.w), u_xlat4.w, u_xlat3.x);
                        u_xlat3.x = max(u_xlat3.x, 0.0);
                        u_xlat3.x = sqrt(u_xlat3.x);
                        u_xlat33 = u_xlat4.w * _VGCBuffer._CotHalfFov;
                        u_xlat1.x = u_xlat1.x * u_xlat33;
                        u_xlat1.x = u_xlat1.x / u_xlat3.x;
                        u_xlat1.x = u_xlat1.x * _VGCBuffer._ScreenHeight;
                        u_xlat3.y = u_xlat1.x * 0.5;
                    }
                }
                u_xlat1.x = u_xlat3.y * u_xlat8.z;
                u_xlat3.x = u_xlat5.y * u_xlat8.z;
                u_xlat47 = u_xlat47 * _VGCBuffer._ErrorThreshold;
                u_xlatb15 = u_xlati15==u_xlati45;
                u_xlatb15 = u_xlatb15 && u_xlatb32.x;
                u_xlatb45 = u_xlat47<u_xlat1.x;
                u_xlatb1 = u_xlat47>=u_xlat3.x;
                u_xlatb15 = u_xlatb15 || u_xlatb1;
                u_xlatb15 = u_xlatb45 && u_xlatb15;
                u_xlatu2.x = u_xlatb15 ? uint(u_xlati46) : uint(0);
            }
        }
        u_xlati15 = ~(u_xlati31);
        u_xlati45 = int(uint(u_xlati15) & u_xlatu2.x);
        u_xlatb1 = int(Globals._DisableSelfVisibilityCulling)==0x0;
        u_xlati45 = u_xlatb1 ? u_xlati45 : int(0);
        u_xlatb1 = as_type<int>(u_xlat7.w)!=int(0xffffffffu);
        u_xlati45 = u_xlatb1 ? u_xlati45 : int(0);
        if((uint(u_xlati45))!=uint(0)){
            u_xlat1.xzw = float3(as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x40 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x40 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x40 >> 2) + 2]));
            u_xlat3.xyz = float3(as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x50 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x50 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x50 >> 2) + 2]));
            u_xlat4.xyz = float3(as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x60 >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x60 >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0x60 >> 2) + 2]));
            u_xlat5 = float4(as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0xac >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0xac >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0xac >> 2) + 2]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0xac >> 2) + 3]));
            u_xlat8.xyz = float3(as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0xbc >> 2) + 0]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0xbc >> 2) + 1]), as_type<float>(InstanceDataBuffer[u_xlatu0.x].value[(0xbc >> 2) + 2]));
            u_xlat45 = dot(_VGCBuffer._SelfVisibilityForwardDir.xyzx.xyz, _VGCBuffer._SelfVisibilityForwardDir.xyzx.xyz);
            u_xlatb45 = u_xlat45!=0.0;
            u_xlat9.xyz = (-u_xlat12.xyz) + _VGCBuffer._CameraWorldSpacePosition.xxyz.yzw;
            u_xlat32 = dot(u_xlat9.xyz, u_xlat9.xyz);
            u_xlat32 = rsqrt(u_xlat32);
            u_xlat9.xyz = float3(u_xlat32) * u_xlat9.xyz;
            u_xlat9.xyz = (bool(u_xlatb45)) ? (-_VGCBuffer._SelfVisibilityForwardDir.xyzx.xyz) : u_xlat9.xyz;
            u_xlat10.x = u_xlat1.x;
            u_xlat10.y = u_xlat3.x;
            u_xlat10.z = u_xlat4.x;
            u_xlat45 = dot(u_xlat10.xyz, u_xlat9.xyz);
            u_xlat10.x = u_xlat1.z;
            u_xlat10.y = u_xlat3.y;
            u_xlat10.z = u_xlat4.y;
            u_xlat1.x = dot(u_xlat10.xyz, u_xlat9.xyz);
            u_xlat4.x = u_xlat1.w;
            u_xlat4.y = u_xlat3.z;
            u_xlat31 = dot(u_xlat4.xyz, u_xlat9.xyz);
            u_xlat7.z = u_xlat5.x;
            u_xlat3.xyz = u_xlat1.xxx * u_xlat5.yzw;
            u_xlat3.xyz = fma(u_xlat7.xyz, float3(u_xlat45), u_xlat3.xyz);
            u_xlat1.xzw = fma(u_xlat8.xyz, float3(u_xlat31), u_xlat3.xyz);
            u_xlat45 = dot(u_xlat1.xzw, u_xlat1.xzw);
            u_xlat45 = rsqrt(u_xlat45);
            u_xlat3.xyz = float3(u_xlat45) * u_xlat1.xzw;
            u_xlat3.w = max(u_xlat3.y, 0.00100000005);
            u_xlat45 = dot(u_xlat3.xzw, u_xlat3.xzw);
            u_xlat45 = rsqrt(u_xlat45);
            u_xlat1.xzw = float3(u_xlat45) * u_xlat3.xwz;
            u_xlat45 = dot(float3(1.0, 1.0, 1.0), abs(u_xlat1.xzw));
            u_xlat1.xz = u_xlat1.xw / float2(u_xlat45);
            u_xlat3.x = u_xlat1.z + u_xlat1.x;
            u_xlat3.y = (-u_xlat1.z) + u_xlat1.x;
            u_xlat1.xz = u_xlat3.xy + float2(1.0, 1.0);
            u_xlat1.xz = u_xlat1.xz * float2(0.5, 0.5);
            u_xlat1.xz = clamp(u_xlat1.xz, 0.0f, 1.0f);
            u_xlati30.x = u_xlati30.x + as_type<int>(u_xlat7.w);
            u_xlati3 = int4(int(InstanceVisibilityBuffer[u_xlati30.x].value[(0x0 >> 2) + 0]), int(InstanceVisibilityBuffer[u_xlati30.x].value[(0x0 >> 2) + 1]), int(InstanceVisibilityBuffer[u_xlati30.x].value[(0x0 >> 2) + 2]), int(InstanceVisibilityBuffer[u_xlati30.x].value[(0x0 >> 2) + 3]));
            u_xlati4 = int4(int(InstanceVisibilityBuffer[u_xlati30.x].value[(0x10 >> 2) + 0]), int(InstanceVisibilityBuffer[u_xlati30.x].value[(0x10 >> 2) + 1]), int(InstanceVisibilityBuffer[u_xlati30.x].value[(0x10 >> 2) + 2]), int(InstanceVisibilityBuffer[u_xlati30.x].value[(0x10 >> 2) + 3]));
            u_xlat30.xy = u_xlat1.xz * float2(15.0, 15.0);
            u_xlat30.xy = floor(u_xlat30.xy);
            u_xlati30.xy = int2(u_xlat30.xy);
            u_xlatu30.xy = uint2(min(u_xlati30.xy, int2(0xe, 0xe)));
            u_xlati1 = int(bitFieldInsert(0x1u, 0x4u, u_xlatu30.y, 0x0u));
            u_xlati1 = int(u_xlatu30.x) + u_xlati1;
            u_xlati1 = 0x3 << u_xlati1;
            u_xlatu31 = u_xlatu30.y + 0x1u;
            u_xlati46 = int(bitFieldInsert(0x1u, 0x4u, u_xlatu31, 0x0u));
            u_xlati30.x = int(u_xlatu30.x) + u_xlati46;
            u_xlati30.x = 0x3 << u_xlati30.x;
            u_xlati46 = int(u_xlatu30.y) >> 0x1;
            u_xlati46 = int(uint(u_xlati46) & 0x4u);
            u_xlati5 = (int(u_xlati46) != 0) ? u_xlati4 : u_xlati3;
            u_xlatu45 = bitFieldExtractU(0x2u, 0x1u, u_xlatu30.y);
            u_xlatb32.xy = (int2(u_xlatu45)==int2(0x1, 0x2));
            u_xlati46 = (u_xlatb32.y) ? u_xlati5.z : u_xlati5.w;
            u_xlati46 = (u_xlatb32.x) ? u_xlati5.y : u_xlati46;
            u_xlati45 = (u_xlatu45 != uint(0)) ? u_xlati46 : u_xlati5.x;
            u_xlati46 = int(u_xlatu31) >> 0x1;
            u_xlati46 = int(uint(u_xlati46) & 0x4u);
            u_xlati3 = (int(u_xlati46) != 0) ? u_xlati4 : u_xlati3;
            u_xlatu31 = bitFieldExtractU(0x2u, 0x1u, u_xlatu31);
            u_xlatb32.xy = (int2(u_xlatu31)==int2(0x1, 0x2));
            u_xlati46 = (u_xlatb32.y) ? u_xlati3.z : u_xlati3.w;
            u_xlati46 = (u_xlatb32.x) ? u_xlati3.y : u_xlati46;
            u_xlati31 = (u_xlatu31 != uint(0)) ? u_xlati46 : u_xlati3.x;
            u_xlati45 = int(uint(u_xlati1) & uint(u_xlati45));
            u_xlati30.x = int(uint(u_xlati30.x) & uint(u_xlati31));
            u_xlati30.x = int(uint(u_xlati30.x) | uint(u_xlati45));
            u_xlatu2.x = (u_xlati30.x!=0x0) ? 0xFFFFFFFFu : uint(0);
        }
        u_xlati15 = int(uint(u_xlati15) & u_xlatu2.x);
        if((uint(u_xlati15))!=uint(0)){
            u_xlat15.xy = u_xlat12.yy * _VGDirtyRegionCBuffer.hlslcc_mtx4x4_DirtyLightViewMatrix[1].xy;
            u_xlat15.xy = fma(_VGDirtyRegionCBuffer.hlslcc_mtx4x4_DirtyLightViewMatrix[0].xy, u_xlat12.xx, u_xlat15.xy);
            u_xlat15.xy = fma(_VGDirtyRegionCBuffer.hlslcc_mtx4x4_DirtyLightViewMatrix[2].xy, u_xlat12.zz, u_xlat15.xy);
            u_xlat15.xy = u_xlat15.xy + _VGDirtyRegionCBuffer.hlslcc_mtx4x4_DirtyLightViewMatrix[3].xy;
            u_xlatu3.y = 0x0u;
            u_xlatu2.x = uint(0x0u);
            u_xlatu2.y = uint(0x0u);
            u_xlati45 = 0x0;
            while(true){
                u_xlatb1 = u_xlatu2.y>=_VGDirtyRegionCBuffer._DirtyBoundsCount;
                u_xlati45 = 0x0;
                if(u_xlatb1){break;}
                u_xlat1.xz = _VGDirtyRegionCBuffer.hlslcc_mtx4x4_DirtyLightViewMatrix[1].xy * _VGDirtyRegionCBuffer._DirtyBounds[int(u_xlatu2.y)].yy;
                u_xlat1.xz = fma(_VGDirtyRegionCBuffer.hlslcc_mtx4x4_DirtyLightViewMatrix[0].xy, _VGDirtyRegionCBuffer._DirtyBounds[int(u_xlatu2.y)].xx, u_xlat1.xz);
                u_xlat1.xz = fma(_VGDirtyRegionCBuffer.hlslcc_mtx4x4_DirtyLightViewMatrix[2].xy, _VGDirtyRegionCBuffer._DirtyBounds[int(u_xlatu2.y)].zz, u_xlat1.xz);
                u_xlat1.xz = u_xlat1.xz + _VGDirtyRegionCBuffer.hlslcc_mtx4x4_DirtyLightViewMatrix[3].xy;
                u_xlat1.xz = u_xlat15.xy + (-u_xlat1.xz);
                u_xlat1.x = dot(u_xlat1.xz, u_xlat1.xz);
                u_xlat1.x = sqrt(u_xlat1.x);
                u_xlat31 = fma(u_xlat16, 1.74000001, _VGDirtyRegionCBuffer._DirtyBounds[int(u_xlatu2.y)].w);
                u_xlatb1 = u_xlat1.x<u_xlat31;
                if(u_xlatb1){
                    u_xlatu2.x = 0xffffffffu;
                    u_xlati45 = int(0xffffffffu);
                    break;
                }
                u_xlatu3.x = u_xlatu2.y + 0x1u;
                u_xlatu2.xy = u_xlatu3.yx;
                u_xlatb45 = u_xlatb1;
            }
            if((uint(u_xlati45))==uint(0)){
                u_xlatu2.x = 0x0u;
            }
        }
        if((u_xlatu2.x)!=uint(0)){
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
