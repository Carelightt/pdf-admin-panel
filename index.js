
const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3000;

const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, 'data', 'users.db'));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/fonts', express.static(path.join(__dirname, 'fonts')));
app.use(session({
    secret: 'gizli_pdf_sistemi',
    resave: false,
    saveUninitialized: true,
}));

function requireLogin(req, res, next) {
    if (!req.session.username) return res.redirect('/login');
    next();
}

function requireAdmin(req, res, next) {
  const allowedAdmins = ['admin', 'Cengizzatay'];
  if (!allowedAdmins.includes(req.session.username)) {
    return res.status(403).send('Yetkisiz');
  }
  next();
}


app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
    const user = stmt.get(username);

    if (user && bcrypt.compareSync(password, user.password)) {
        req.session.username = username;
        res.redirect('/');
    } else {
        res.send('Geçersiz bilgiler <a href="/login">Geri dön</a>');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

app.get('/', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.post('/generate', requireLogin, async (req, res) => {
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

    page.drawRectangle({ x: 180, y: tcPos.y - 2, width: 180, height: 14, color: rgb(1, 1, 1) });
    page.drawRectangle({ x: 180, y: adPos.y - 2, width: 180, height: 14, color: rgb(1, 1, 1) });
    page.drawRectangle({ x: 180, y: soyadPos.y - 2, width: 180, height: 14, color: rgb(1, 1, 1) });

    page.drawText(tc, { x: tcPos.x, y: tcPos.y, size: fontSize, font, color: rgb(0, 0, 0) });
    page.drawText(ad, { x: adPos.x, y: adPos.y, size: fontSize, font, color: rgb(0, 0, 0) });
    page.drawText(soyad, { x: soyadPos.x, y: soyadPos.y, size: fontSize, font, color: rgb(0, 0, 0) });

    const filename = `${ad}_${soyad}.pdf`;
    const pdfBytes = await pdfDoc.save();

    const logs = JSON.parse(fs.readFileSync(LOGS_FILE));
    logs.push({ user: req.session.username, tc, ad, soyad, date: new Date().toISOString() });
    fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2));

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(Buffer.from(pdfBytes));
});

app.get('/admin', requireLogin, requireAdmin, (req, res) => {
    const users = JSON.parse(fs.readFileSync(USERS_FILE));
    const logs = JSON.parse(fs.readFileSync(LOGS_FILE));
    let html = '<h2>PDF Logları</h2><ul>';
    for (let log of logs) {
        html += `<li>${log.date} - ${log.user} → ${log.ad} ${log.soyad} (TC: ${log.tc})</li>`;
    }
    html += '</ul><h2>Kullanıcılar</h2><ul>';
    for (let u of users) {
        html += `<li>${u.username} <form method="POST" action="/admin/delete" style="display:inline"><input type="hidden" name="username" value="${u.username}"><button>Sil</button></form></li>`;
    }
    html += `
    </ul>
    <form method="POST" action="/admin/add">
        <input name="username" placeholder="Kullanıcı adı" required />
        <input name="password" placeholder="Şifre" type="password" required />
        <button type="submit">Ekle</button>
    </form>`;
    res.send(html);
});

app.post('/admin/add', requireLogin, requireAdmin, (req, res) => {
    const { username, password } = req.body;
    const existing = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (existing) return res.send('Zaten var');

    const hashed = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, hashed);
    res.redirect('/admin');
});

app.post('/admin/delete', requireLogin, requireAdmin, (req, res) => {
    db.prepare('DELETE FROM users WHERE username = ?').run(req.body.username);
    res.redirect('/admin');
});

// GEÇİCİ: Admin kullanıcıyı ekle

const username = 'CengizzAtay';
const plainPassword = 'Mceroglu1.';
const existing = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

if (!existing) {
  const hashed = bcrypt.hashSync(plainPassword, 10);
  db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, hashed);
  console.log('✅ Admin kullanıcı eklendi!');
} else {
  console.log('⚠️ Admin kullanıcı zaten var.');
}

Kullanıcı adı: CengizzAtay
Şifre: Mceroglu1.
    
app.listen(PORT, () => console.log(`http://localhost:${PORT} çalışıyor...`));
