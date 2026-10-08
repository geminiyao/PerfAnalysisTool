#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct Globals_Type
{
    uint _TotalInstanceVisibilityCount ;
    uint _RTWidth ;
    uint _RTHeight ;
    uint _SnapshotBitIndex ;
};

struct _InstanceBuffer_Type
{
    uint value[68];
};

struct _VGMeshBuffer_Type
{
    uint value[12];
};

struct _SelfVisibilityMaskBuffer_Type
{
    uint value[1];
};

kernel void computeMain(
    constant Globals_Type& Globals [[ buffer(1) ]],
    texture2d<float, access::sample > _SelfVisibilityRT [[ texture(0) ]] ,
    const device _InstanceBuffer_Type *_InstanceBuffer [[ buffer(2) ]],
    const device _VGMeshBuffer_Type *_VGMeshBuffer [[ buffer(3) ]],
    device _SelfVisibilityMaskBuffer_Type *_SelfVisibilityMaskBuffer [[ buffer(0) ]],
    uint3 mtl_ThreadID [[ thread_position_in_grid ]])
{
    _InstanceBuffer = reinterpret_cast<const device _InstanceBuffer_Type *> (reinterpret_cast<device const atomic_uint *> (_InstanceBuffer) + 1);
    _VGMeshBuffer = reinterpret_cast<const device _VGMeshBuffer_Type *> (reinterpret_cast<device const atomic_uint *> (_VGMeshBuffer) + 1);
    _SelfVisibilityMaskBuffer = reinterpret_cast<device _SelfVisibilityMaskBuffer_Type *> (reinterpret_cast<device atomic_uint *> (_SelfVisibilityMaskBuffer) + 1);
    float2 u_xlat0;
    int2 u_xlati0;
    uint4 u_xlatu0;
    bool2 u_xlatb0;
    int u_xlati1;
    uint u_xlatu1;
    bool u_xlatb1;
    int u_xlati2;
    bool2 u_xlatb2;
    u_xlatb0.xy = (mtl_ThreadID.xy>=uint2(Globals._RTWidth, Globals._RTHeight));
    u_xlatb0.x = u_xlatb0.y || u_xlatb0.x;
    if(u_xlatb0.x){
        return;
    }
    u_xlatu0.xy = mtl_ThreadID.xy;
    u_xlatu0.z = uint(0x0u);
    u_xlatu0.w = uint(0x0u);
    u_xlat0.xy = _SelfVisibilityRT.read(u_xlatu0.xy, u_xlatu0.w).xy;
    u_xlatb2.xy = (u_xlat0.xy<float2(0.0, 0.0));
    u_xlatb2.x = u_xlatb2.y || u_xlatb2.x;
    if(u_xlatb2.x){
        return;
    }
    u_xlatu0.xy = uint2(u_xlat0.yx);
    u_xlati2 = int(_InstanceBuffer[u_xlatu0.x].value[(0x94 >> 2) + 0]);
    u_xlati0.x = int(_InstanceBuffer[u_xlatu0.x].value[(0xa0 >> 2) + 0]);
    u_xlati2 = int(_VGMeshBuffer[u_xlati2].value[(0x14 >> 2) + 0]);
    u_xlati1 = (-u_xlati2) + int(u_xlatu0.y);
    u_xlatu0.x = uint(u_xlati1) + uint(u_xlati0.x);
    u_xlatb1 = u_xlatu0.x>=Globals._TotalInstanceVisibilityCount;
    if(u_xlatb1){
        return;
    }
    u_xlatu1 = Globals._SnapshotBitIndex >> 0x5u;
    u_xlati2 = 0x1 << int(Globals._SnapshotBitIndex);
    u_xlati0.x = int(u_xlatu0.x) << 0x3;
    u_xlati0.x = int(u_xlatu1) + u_xlati0.x;
    u_xlati0.y = 0x0;
    atomic_fetch_or_explicit(reinterpret_cast<device atomic_uint *>(&_SelfVisibilityMaskBuffer[u_xlati0.x].value[u_xlati0.y >> 2]), uint(u_xlati2), memory_order::memory_order_relaxed);
    return;
}
