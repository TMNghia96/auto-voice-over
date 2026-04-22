import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource } from "eventsource";
import path from "path";

(global as any).EventSource = EventSource;

async function run() {
  const transport = new SSEClientTransport(new URL("http://localhost:3000/mcp"));
  const client = new Client(
    { name: "antigravity-commander", version: "1.0.0" },
    { capabilities: {} }
  );

  try {
    await client.connect(transport);
    
    const text = "hello tôi là siêu nhân điện quang";
    const voiceName = "vi-VN-NamMinhNeural";
    const outputPath = path.resolve("sieu_nhan.mp3");

    console.log(`Đang yêu cầu tạo giọng đọc: "${text}"...`);
    
    const result = await client.callTool({
      name: "generate_voice",
      arguments: {
        text,
        voiceName,
        outputPath
      }
    });

    console.log("Kết quả từ Server:", JSON.stringify(result, null, 2));
    await transport.close();
  } catch (err) {
    console.error("Lỗi khi gọi MCP Tool:", err);
    process.exit(1);
  }
}

run();
