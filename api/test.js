export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Use POST' });
  }

  return res.status(200).json({
    ok: true,
    message: '✅ Vercel serverless OK',
  });
}

