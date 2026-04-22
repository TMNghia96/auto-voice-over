import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource } from "eventsource";

// MCP SDK yêu cầu EventSource phải có sẵn trong môi trường Node.js
(global as any).EventSource = EventSource;

async function run() {
  console.log("-----------------------------------------");
  console.log("MCP CLIENT TEST: Connecting to localhost:3000/mcp...");
  console.log("-----------------------------------------");

  const transport = new SSEClientTransport(new URL("http://localhost:3000/mcp"));
  const client = new Client(
    { name: "antigravity-tester", version: "1.0.0" },
    { capabilities: {} }
  );

  try {
    // Thêm một chút delay để server kịp khởi động trong các trường hợp tải nặng
    console.log("Đợi server sẵn sàng...");
    
    await client.connect(transport);
    console.log("✅ Kết nối thành công tới MCP Server!");

    console.log("\n[1] Đang lấy danh sách các Tools khả dụng...");
    const toolsResponse = await client.listTools();
    console.log(`Tìm thấy ${toolsResponse.tools.length} công cụ:`);
    toolsResponse.tools.forEach(tool => {
        console.log(` - ${tool.name}: ${tool.description}`);
    });

    console.log("\n[2] Đang gọi thử tool 'get_gpu_info'...");
    const statusResult = await client.callTool({
      name: "get_gpu_info"
    });
    console.log("Kết quả phản hồi từ Server:");
    console.log(JSON.stringify(statusResult, null, 2));

    console.log("\n[3] Đang gọi thử tool 'list_projects'...");
    const modelsResult = await client.callTool({
      name: "list_projects"
    });
    console.log("Dữ liệu project:");
    console.log(JSON.stringify(modelsResult, null, 2));

    console.log("\n-----------------------------------------");
    console.log("KIỂM TRA HOÀN TẤT!");
    console.log("-----------------------------------------");

    await transport.close();
    process.exit(0);
  } catch (err) {
    console.error("\n❌ LỖI KẾT NỐI MCP:", err);
    process.exit(1);
  }
}

// Chạy script
run();
