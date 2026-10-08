#include <metal_stdlib>                                                    
using namespace metal;                                                     
struct ApplicationData                                                     
{                                                                          
    float4 pos [[attribute(0)]]; half4 color [[attribute(3)]];             
};                                                                         
struct RasterizerData                                                      
{                                                                          
    float4 pos [[position]]; half4 color;                                  
};                                                                         
                                                                           
vertex RasterizerData clear_vprog(ApplicationData input [[stage_in]])      
{                                                                          
    return (RasterizerData) { .pos = input.pos, .color = input.color };    
}                                                                          
fragment half4 clear_fshader(RasterizerData input [[stage_in]])            
{                                                                          
    return input.color;                                                    
}                                                                          
