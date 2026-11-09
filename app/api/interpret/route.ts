import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const chartData = body.chartData;

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      console.error('DEEPSEEK_API_KEY is missing in environment variables');
      return NextResponse.json({ error: '服务器未配置 DEEPSEEK_API_KEY 环境变量' }, { status: 500 });
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
      console.error('DeepSeek API raw error:', JSON.stringify(data));
      // 将 DeepSeek 返回的具体错误信息直接返回给前端显示，方便排查
      const errorMsg = data.error?.message || JSON.stringify(data);
      return NextResponse.json({ error: `DeepSeek 报错: ${errorMsg}` }, { status: response.status });
    }

    const result = data.choices?.[0]?.message?.content || '未返回有效解读数据';
    return NextResponse.json({ result });
  } catch (error: any) {
    console.error('Server internal catch error:', error);
    return NextResponse.json({ error: `服务器异常: ${error.message}` }, { status: 500 });
  }
}
