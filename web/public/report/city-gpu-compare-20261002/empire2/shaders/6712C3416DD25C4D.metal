#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct Mtl_FragmentIn
{
    float2 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
};

struct Mtl_FragmentOut
{
    float mtl_Depth [[ depth(any) ]];
};

fragment Mtl_FragmentOut xlatMtlMain(
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    float u_xlat0;
    bool u_xlatb0;
    u_xlat0 = dot(input.TEXCOORD0.xy, input.TEXCOORD0.xy);
    u_xlat0 = sqrt(u_xlat0);
    u_xlatb0 = 1.0<u_xlat0;
    if(((int(u_xlatb0) * int(0xffffffffu)))!=0){discard_fragment();}
    output.mtl_Depth = 0.0;
    return output;
}
