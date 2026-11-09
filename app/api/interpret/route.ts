import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { chartData } = await req.json();

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
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
      return NextResponse.json({ error: data.error?.message || '调用 API 失败' }, { status: response.status });
    }

    const result = data.choices[0].message.content;
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json({ error: 'AI 解读失败，请检查配置' }, { status: 500 });
  }
}
