import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const chartData = body.chartData || body.chart;

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: '环境变量未配置 DEEPSEEK_API_KEY' }, { status: 500 });
    }

    // 1. 读取本地 knowledge 或 library 里的内置资料库内容作为专业背景
    let localKnowledge = '';
    try {
      const knowledgeDir = path.join(process.cwd(), 'knowledge'); // 或者 'library'
      if (fs.existsSync(knowledgeDir)) {
        const files = fs.readdirSync(knowledgeDir);
        for (const file of files) {
          if (file.endsWith('.md') || file.endsWith('.txt')) {
            const filePath = path.join(knowledgeDir, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            localKnowledge += `\n--- 内部参考资料: ${file} ---\n${content}\n`;
          }
        }
      }
    } catch (e) {
      console.log('读取本地知识库失败，使用默认设定', e);
    }

    // 2. 构造强大的系统提示词，强制要求 AI 结合内置资料深度解读
    const systemPrompt = `你是一位精通紫微斗数的命理大师，严格遵循本项目内置的专业命理学体系和核心资料进行解盘。
绝对不要说空洞、模棱两可的泛泛之谈，必须结合用户提供的具体星曜、四化、宫位及以下内置专业资料进行深度、硬核、逻辑严密的剖析：

【内部专业资料库内容】：
${localKnowledge || '（请严格根据传统紫微斗数三方四正、星曜庙旺利陷及四化飞化进行专业、具体的深度解盘）'}

请遵循以下输出原则：
1. 逐宫逐星分析，指出具体某宫某星的吉凶象义，绝不大撒把说废话。
2. 结合格局、四化飞化给出具体可执行的断语和建议。`;

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
            content: systemPrompt,
          },
          {
            role: 'user',
            content: `这是我的紫微斗数命盘数据：${JSON.stringify(chartData)}，请严格结合上述内部资料，为我详细深度剖析命宫、事业、财运及当前大限流年。`,
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
                  const payload = JSON.stringify({ delta: { text: content } });
                  controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
                }
              } catch (e) {
                // 忽略
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
