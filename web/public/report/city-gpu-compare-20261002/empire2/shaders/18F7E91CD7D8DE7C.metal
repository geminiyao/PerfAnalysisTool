#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct Mtl_VertexIn
{
    float3 POSITION0 [[ attribute(0) ]] ;
};

struct Mtl_VertexOut
{
    float4 mtl_Position [[ position ]];
};

vertex Mtl_VertexOut xlatMtlMain(
    Mtl_VertexIn input [[ stage_in ]])
{
    Mtl_VertexOut output;
    output.mtl_Position.xyz = input.POSITION0.xyz;
    output.mtl_Position.w = 1.0;
    return output;
}
