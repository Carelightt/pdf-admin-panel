const express = require('express');
const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const bodyParser = require('body-parser');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;

const db = new Database(path.join(__dirname, 'data', 'users.db'));

db.prepare(`
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user TEXT,
    tc TEXT,
    ad TEXT,
    soyad TEXT,
    date TEXT
  )
`).run();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/fonts', express.static(path.join(__dirname, 'fonts')));
app.use(express.static(path.join(__dirname, 'views')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin-login.html'));
});

app.post('/admin-login', (req, res) => {
  const password = req.body.password;
  if (password === 'FUW9p8oMR9MhkqPnyXka7TGkc') {
    res.redirect('/admin-panel.html');
  } else {
    res.send('<h2>Hatalı şifre dayı!</h2>');
  }
});

app.post('/generate', async (req, res) => {
  const { tc, ad, soyad } = req.body;
  const templatePath = path.join(__dirname, 'public', 'sablon.pdf');
  const fontPath = path.join(__dirname, 'fonts', 'LiberationSans-Bold.ttf');

  const existingPdfBytes = fs.readFileSync(templatePath);
  const customFont = fs.readFileSync(fontPath);

  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(customFont);

  const page = pdfDoc.getPages()[0];
  const fontSize = 11;

  const tcPos = { x: 180, y: 588 };
  const adPos = { x: 180, y: 571 };
  const soyadPos = { x: 180, y: 554 };
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  page.drawRectangle({ x: 180, y: tcPos.y - 2, width: 180, height: 14, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: 180, y: adPos.y - 2, width: 180, height: 14, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: 180, y: soyadPos.y - 2, width: 180, height: 14, color: rgb(1, 1, 1) });

  page.drawText(tc, { x: tcPos.x, y: tcPos.y, size: fontSize, font, color: rgb(0, 0, 0) });
  page.drawText(ad, { x: adPos.x, y: adPos.y, size: fontSize, font, color: rgb(0, 0, 0) });
  page.drawText(soyad, { x: soyadPos.x, y: soyadPos.y, size: fontSize, font, color: rgb(0, 0, 0) });

  const filename = `${ad}_${soyad}.pdf`;
  const pdfBytes = await pdfDoc.save();

  db.prepare('INSERT INTO logs (user, tc, ad, soyad, date) VALUES (?, ?, ?, ?, ?)').run(
    "Anonim", tc, ad, soyad, new Date().toISOString()
  );

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.send(Buffer.from(pdfBytes));
});

app.listen(PORT, () => console.log(`http://localhost:${PORT} çalışıyor...`));
