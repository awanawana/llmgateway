---
id: "17"
slug: "auto-routing-model-context-aware"
date: "2025-08-31"
title: "Introducing Smart Auto Routing: Context-Aware Model Selection"
summary: "The 'auto' routing model now intelligently selects models based on your request's context size requirements, ensuring optimal performance and cost efficiency."
image:
  src: "/changelog/auto-routing-context-aware.png"
  alt: "Auto routing model with context-aware selection on LLM Gateway"
  width: 1768
  height: 677
---

We're excited to announce a major enhancement to our **'auto' routing model** - introducing **context-aware model selection** that automatically chooses the best model for your specific request requirements.

## 🧠 Smart Context Analysis

**Automatic Context Estimation**: The auto routing system now analyzes your input messages, tools, and completion requirements to estimate the total context size needed for your request.

**Intelligent Model Filtering**: Only models with sufficient context capacity are considered, preventing failures due to context size limitations.

**Cost-Optimized Selection**: Among suitable models, the system selects the most cost-effective option that meets your requirements.

## 🎯 How It Works

**Message Analysis**: The system analyzes your conversation history and input messages to determine the required context window.

**Tool Integration**: When using function calling, tool definitions are factored into the context size calculation.

**Completion Buffer**: Automatically accounts for response length requirements, including your specified `max_tokens` parameter.

**Provider Filtering**: Only considers models and providers that can handle your estimated context requirements.

## ⚙️ Technical Enhancements

**Precise Token Counting**: Uses advanced tokenization to accurately estimate context requirements rather than simple character-based approximations.

**Provider Context Limits**: Respects individual provider context size limits to ensure compatibility across different AI providers.

**Fallback Protection**: Maintains robust fallback behavior to ensure your requests always receive a response, even with unusual requirements.

## 💡 Benefits

**Reduced Failures**: Eliminates context size-related errors by selecting appropriate models upfront.

**Cost Efficiency**: Automatically chooses the most economical model that meets your specific needs.

**Seamless Experience**: No configuration required - the system works intelligently behind the scenes.

**Better Performance**: Ensures your requests are routed to models with adequate capacity for optimal results.

## 🚀 Getting Started

**Already Available**: This enhancement is automatically active when using `model: "auto"` in your API calls.

**No Changes Required**: Existing implementations continue to work while benefiting from improved routing intelligence.

**Transparent Operation**: The system works seamlessly without affecting your existing API integration.

## 🔮 What's Next

This context-aware routing represents the foundation for even smarter model selection. Future enhancements will consider additional factors like task complexity, response quality requirements, and specialized model capabilities.

---

**Ready to experience smarter routing?** Simply use `model: "auto"` in your next API call and let our intelligent system handle the rest.