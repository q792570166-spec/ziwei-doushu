import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const chartData = body.chartData || body.chart;

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: '环境变量未配置 DEEPSEEK_API_KEY' }, { status: 500 });
    }

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: '你是一位精通紫微斗数的命理大师，请根据用户提供的星盘格局信息进行详细解读。',
          },
          {
            role: 'user',
            content: `这是我的紫微斗数命盘数据：${JSON.stringify(chartData)}，请帮我分析命宫、事业和财运。`,
          },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: `DeepSeek 错误: ${errorText}` }, { status: response.status });
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    // 创建一个转换流，将 DeepSeek 的响应格式精准转换为前端代码要求的 delta.text 格式
    const customStream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) continue;
              const dataStr = trimmed.slice(5).trim();
              
              if (dataStr === '[DONE]') {
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                continue;
              }

              try {
                const json = JSON.parse(dataStr);
                const content = json.choices?.[0]?.delta?.content;
                if (content) {
                  // 完美匹配前端代码：JSON.parse(data).delta.text
                  const payload = JSON.stringify({ delta: { text: content } });
                  controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
                }
              } catch (e) {
                // 忽略无法解析的行
              }
            }
          }
        } catch (err) {
          console.error('Stream processing error:', err);
        } finally {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      },
    });

    return new Response(customStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: `服务器异常: ${error.message}` }, { status: 500 });
  }
}
