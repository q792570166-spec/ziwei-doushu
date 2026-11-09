import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const chartData = body.chartData || body.chart;
    const userMessages = body.messages || []; // 获取前端传过来的对话历史与最新提问

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: '环境变量未配置 DEEPSEEK_API_KEY' }, { status: 500 });
    }

    // 1. 读取本地知识库资料
    let localKnowledge = '';
    try {
      const knowledgeDir = path.join(process.cwd(), 'knowledge');
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
      console.log('读取知识库失败', e);
    }

    // 2. 系统提示词：保留专业度，但允许针对不同问题灵活作答
    const systemPrompt = `你是一位精通紫微斗数的命理大师，请根据用户提供的星盘格局，并严格结合本项目内置的专业资料回答问题。
内部专业资料库：
${localKnowledge || '（根据传统紫微斗数三方四正与四化飞化专业解答）'}

【回答要求】：
1. 必须针对用户当前提出的**具体问题**进行精准解答（如问感情就聚焦婚姻宫/夫妻宫，问财运就聚焦财帛宫/田宅宫，追问具体年份就看流年四化）。
2. 切忌千篇一律地重复总论，必须扣紧用户的问题。`;

    // 3. 构建完整的对话上下文
    let formattedMessages = [
      { role: 'system', content: systemPrompt }
    ];

    if (userMessages.length > 0) {
      // 如果前端传了对话历史，直接使用前端传过来的问题
      // 并在最开始补充当前命盘数据作为背景
      formattedMessages.push({
        role: 'user',
        content: `【我的命盘数据】：${JSON.stringify(chartData)}`
      });
      formattedMessages = formattedMessages.concat(userMessages);
    } else {
      // 默认单次解读提问
      formattedMessages.push({
        role: 'user',
        content: `【我的命盘数据】：${JSON.stringify(chartData)}，请严格结合内置资料，为我详细深度剖析命宫与格局。`
      });
    }

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: formattedMessages,
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
