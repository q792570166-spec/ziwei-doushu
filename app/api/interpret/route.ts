import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const chartData = body.chartData;

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
        stream: true, // 开启流式传输，匹配前端组件
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: `DeepSeek 错误: ${errorText}` }, { status: response.status });
    }

    // 直接将 DeepSeek 的流式返回转发给前端
    return new Response(response.body, {
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
