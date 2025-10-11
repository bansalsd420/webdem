export default function underageBlock(req, res, next) {
  try {
    const cookie = req.cookies && req.cookies.ms_underage;
    if (cookie === '1') {
      // Block API access for underage flag
      return res.status(403).json({ error: 'age_restricted', message: 'Access blocked due to age verification' });
    }
  } catch (e) {
    // ignore and continue
  }
  next();
}
