package com.xenonai.app;

public class AppState {
    public static String activeModel = null;
    public static int maxTokens = 256;
    public static float temperature = 0.70f;
    public static float topP = 0.95f;
    public static int topK = 40;
    public static String systemPrompt = "You are XenonAI, a fast and helpful local AI assistant.";
}
