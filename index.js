
const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;

const USERS_DB = new Database(path.join(__dirname, 'data', 'users.db'));
const LOGS_DB = new Database(path.join(__dirname, 'data', 'logs.db'));

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
    const user = USERS_DB.prepare('SELECT * FROM users WHERE username = ?').get(username);
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

    LOGS_DB.prepare('INSERT INTO logs (user, tc, ad, soyad, date) VALUES (?, ?, ?, ?, ?)')
           .run(req.session.username, tc, ad, soyad, new Date().toISOString());

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(Buffer.from(pdfBytes));
});

app.get('/admin', requireLogin, requireAdmin, (req, res) => {
    const users = USERS_DB.prepare('SELECT * FROM users').all();
    let html = '<h2>Kullanıcılar</h2><ul>';
    for (let u of users) {
        html += `<li>${u.username} <form method="POST" action="/admin/delete" style="display:inline"><input type="hidden" name="username" value="${u.username}"><button>Sil</button></form></li>`;
    }
    html += `</ul>
    <form method="POST" action="/admin/add">
        <input name="username" placeholder="Kullanıcı adı" required />
        <input name="password" placeholder="Şifre" type="password" required />
        <button type="submit">Ekle</button>
    </form>`;
    res.send(html);
});

app.post('/admin/add', requireLogin, requireAdmin, (req, res) => {
    const { username, password } = req.body;
    const hashed = bcrypt.hashSync(password, 10);
    try {
        USERS_DB.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, hashed);
        res.redirect('/admin');
    } catch (e) {
        res.send('Kullanıcı zaten var');
    }
});

app.post('/admin/delete', requireLogin, requireAdmin, (req, res) => {
    USERS_DB.prepare('DELETE FROM users WHERE username = ?').run(req.body.username);
    res.redirect('/admin');
});

app.get('/admin/logs', requireLogin, requireAdmin, (req, res) => {
    const logs = LOGS_DB.prepare('SELECT * FROM logs ORDER BY date DESC').all();
    let html = `
    <h2 style="text-align:center;">PDF Geçmişi</h2>
    <form method="POST" action="/admin/logs/clear" style="position:absolute; top:20px; right:20px;">
        <button style="background:red;color:white;padding:10px 20px;border:none;border-radius:5px;cursor:pointer;">
            PDF GEÇMİŞİNİ SIFIRLA
        </button>
    </form>
    <table border="1" cellspacing="0" cellpadding="8" style="background:#121212;color:white;width:100%;font-family:sans-serif;border-collapse:collapse;">
      <thead>
        <tr style="background:#1e1e1e;">
          <th>Tarih</th>
          <th>Kullanıcı</th>
          <th>Ad</th>
          <th>Soyad</th>
          <th>TC</th>
        </tr>
      </thead>
      <tbody>
    `;
    logs.forEach(log => {
        html += `
        <tr>
          <td>${log.date}</td>
          <td>${log.user}</td>
          <td>${log.ad}</td>
          <td>${log.soyad}</td>
          <td>${log.tc}</td>
        </tr>
        `;
    });
    html += '</tbody></table>';
    res.send(html);
});

app.post('/admin/logs/clear', requireLogin, requireAdmin, (req, res) => {
    LOGS_DB.prepare('DELETE FROM logs').run();
    res.redirect('/admin/logs');
});

app.listen(PORT, () => console.log(`http://localhost:${PORT} çalışıyor...`));
