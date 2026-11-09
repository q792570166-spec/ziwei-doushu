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
        stream: false,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json({ error: data.error?.message || '调用 DeepSeek API 失败' }, { status: response.status });
    }

    const result = data.choices?.[0]?.message?.content || '未返回有效解读数据';
    
    // 同时兼容前端可能读取的 result、content、text 等多种常见字段名，彻底杜绝前端卡死
    return NextResponse.json({ 
      result: result,
      content: result,
      text: result
    });
  } catch (error: any) {
    return NextResponse.json({ error: `服务器异常: ${error.message}` }, { status: 500 });
  }
}
