// ===== Parámetros normativos vigentes a octubre de 2026 =====
const SMMLV = 1750905;      // Decreto 1469 de 2025
const DIVISOR = 210;        // Jornada de 42 h/sem (Ley 2101 de 2021): 42/6*30
const REC_NOC = 0.35;       // Nocturno 7 p.m. - 6 a.m. (Ley 2466 de 2025)
const REC_DOM = 0.90;       // Dominical/festivo: 90 % desde 1-jul-2026 (100 % desde 1-jul-2027)
const EXT_D = 0.25, EXT_N = 0.75, DAY = 864e5;
const MES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
// Factor sobre la hora ordinaria que se paga ADEMÁS del salario mensual (c = dom/fest compensado)
const CATS = {
    O:   ['Ordinarias diurnas', () => 0],
    ON:  ['Recargo nocturno', () => REC_NOC],
    OD:  ['Recargo dom/fest diurno', c => c ? REC_DOM : 1 + REC_DOM],
    ODN: ['Recargo dom/fest nocturno', c => c ? REC_NOC + REC_DOM : 1 + REC_NOC + REC_DOM],
    E:   ['Extra diurna', () => 1 + EXT_D],
    EN:  ['Extra nocturna', () => 1 + EXT_N],
    ED:  ['Extra diurna dom/fest', () => 1 + EXT_D + REC_DOM],
    EDN: ['Extra nocturna dom/fest', () => 1 + EXT_N + REC_DOM]
};
const iso = t => new Date(t).toISOString().slice(0, 10);
const dmy = s => s.split('-').reverse().join('/');
const fmt = n => Math.round(n).toLocaleString('es-CO');
const hh = m => (m / 60).toFixed(2);

function festivos(y) { // Colombia: fijos, ley Emiliani y Semana Santa
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4,
        f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
        i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
        mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1,
        pascua = Date.UTC(y, mes - 1, dia), out = new Set();
    const lunes = t => t + ((8 - new Date(t).getUTCDay()) % 7) * DAY;
    [[0,1],[4,1],[6,20],[7,7],[11,8],[11,25]].forEach(([mo, dd]) => out.add(iso(Date.UTC(y, mo, dd))));
    [[0,6],[2,19],[5,29],[7,15],[9,12],[10,1],[10,11]].forEach(([mo, dd]) => out.add(iso(lunes(Date.UTC(y, mo, dd)))));
    [-3, -2, 43, 64, 71].forEach(n => out.add(iso(pascua + n * DAY)));
    return out;
}

function fecha(v) {
    if (typeof v === 'number' && v > 20000) return iso(Math.round((v - 25569) * DAY));
    if (v instanceof Date) return iso(v.getTime());
    const m = typeof v === 'string' && v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}
function hora(v) {
    if (typeof v === 'number' && v >= 0 && v <= 1) return Math.round(v * 1440) % 1440;
    const m = typeof v === 'string' && v.match(/^(\d{1,2}):(\d{2})/);
    return m ? +m[1] * 60 + +m[2] : null;
}

function parsear(R) {
    const out = { restaurante: '', almuerzo: 45, ini: null, fin: null, emps: [], avisos: [] };
    const titulo = String((R.find(r => typeof r[0] === 'string') || [])[0] || '');
    out.restaurante = titulo.split('·')[0].trim();
    const p = titulo.match(/del\s+(\d+)\s+al\s+(\d+)\s+de\s+(\p{L}+)\s+de\s+(\d{4})/iu);
    const mo = p ? MES.indexOf(p[3].toLowerCase()) + 1 : 0;
    if (mo) { const z = s => String(s).padStart(2, '0'); out.ini = `${p[4]}-${z(mo)}-${z(p[1])}`; out.fin = `${p[4]}-${z(mo)}-${z(p[2])}`; }
    let cur = null;
    R.forEach((r, i) => {
        const a = r[0], sig = R[i + 1];
        if (typeof a === 'string' && /almuerzo por d/i.test(a)) { const n = r.slice(1).find(x => typeof x === 'number'); if (n != null) out.almuerzo = n; }
        if (typeof a === 'string' && sig && String(sig[0]).trim() === 'Fecha' && String(sig[1]).trim() === 'Entrada') {
            const m = a.match(/^(.*?)\s+C\.?\s?C\.?\s*([\d.]+)/i);
            cur = { nombre: (m ? m[1] : a).trim(), dias: {}, descansos: 0, ausencias: 0 };
            out.emps.push(cur); return;
        }
        if (!cur) return;
        if (typeof a === 'string' && /^total/i.test(a)) { cur = null; return; }
        const f = fecha(a); if (!f) return;
        const e = hora(r[1]), s = hora(r[2]);
        if (e != null && s != null) (cur.dias[f] = cur.dias[f] || []).push([e, s]);
        else if (typeof r[1] === 'string') /aus/i.test(r[1]) ? cur.ausencias++ : cur.descansos++;
        cur.fechas = (cur.fechas || []).concat(f);
    });
    const todas = out.emps.flatMap(e => e.fechas || []).sort();
    if (!out.ini && todas.length) { out.ini = todas[0]; out.fin = todas[todas.length - 1]; }
    out.emps.forEach(e => (e.fechas || []).forEach(f => {
        if (out.ini && (f < out.ini || f > out.fin)) {
            out.avisos.push(`${e.nombre}: la fecha ${dmy(f)} está fuera del período (${dmy(out.ini)} a ${dmy(out.fin)}); se ignoró. Revisa si es un error de digitación.`);
            delete e.dias[f];
        }
    }));
    return out;
}

function calcular(emp, cfg) {
    const min = [];
    Object.keys(emp.dias).sort().forEach(f => {
        const base = Date.parse(f) / 60000, wk = Math.floor((Date.parse(f) / DAY + 3) / 7), ms = [];
        emp.dias[f].slice().sort((x, y) => x[0] - y[0]).forEach(([e, s], i) => {
            const dur = (s - e + 1440) % 1440, ini = base + e, ls = ini + Math.floor((dur - cfg.almuerzo) / 2);
            for (let k = 0; k < dur; k++) { const m = ini + k; if (i || (dur > cfg.almuerzo && (m < ls || m >= ls + cfg.almuerzo))) ms.push(m); }
        });
        ms.forEach((m, k) => min.push({ m, wk, ext: k >= cfg.diario * 60 }));
    });
    const semanas = {};
    min.filter(o => !o.ext).forEach(o => (semanas[o.wk] = semanas[o.wk] || []).push(o));
    Object.keys(semanas).forEach(w => { // límite semanal solo en semanas completas dentro del período
        const ini = w * 7 - 3;
        if (ini < Date.parse(cfg.ini) / DAY || ini + 6 > Date.parse(cfg.fin) / DAY) return;
        const ord = semanas[w].sort((x, y) => y.m - x.m);
        ord.slice(0, Math.max(0, ord.length - cfg.semanal * 60)).forEach(o => o.ext = true);
    });
    const acc = {};
    min.forEach(o => {
        const d = new Date(o.m * 60000), h = d.getUTCHours();
        const dom = d.getUTCDay() === 0 || cfg.festivos.has(iso(o.m * 60000));
        const k = (o.ext ? 'E' : 'O') + (dom ? 'D' : '') + (h >= 19 || h < 6 ? 'N' : '');
        acc[k] = (acc[k] || 0) + 1;
    });
    const rows = Object.keys(CATS).filter(k => acc[k]).map(k => {
        const factor = CATS[k][1](cfg.comp);
        return { nombre: CATS[k][0], min: acc[k], factor, valor: acc[k] / 60 * cfg.valorHora * factor };
    });
    return {
        rows, total: rows.reduce((s, r) => s + r.valor, 0), horas: min.length,
        extra: rows.filter(r => /^Extra/.test(r.nombre)).reduce((s, r) => s + r.min, 0)
    };
}

// ===== Interfaz =====
let datos = null;
const $ = id => id[0] === '[' ? document.querySelector(id) : document.getElementById(id);

function cargar(file) {
    const rd = new FileReader();
    rd.onload = ev => {
        try {
            const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
            const R = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
            datos = parsear(R);
            if (!datos.emps.length) throw new Error('No encontré empleados. Verifica que el formato sea el mismo del archivo de horas.');
            iniciar();
        } catch (err) { $('estado').textContent = '⚠️ ' + err.message; }
    };
    rd.readAsArrayBuffer(file);
}

function iniciar() {
    $('restaurante').textContent = (datos.restaurante || 'Restaurante') + (datos.ini ? ` · ${dmy(datos.ini)} a ${dmy(datos.fin)}` : '');
    $('estado').textContent = `✅ ${datos.emps.length} empleados leídos.`;
    $('almuerzo').value = datos.almuerzo;
    const fest = [...festivos(+datos.ini.slice(0, 4))].filter(f => f >= datos.ini && f <= datos.fin).sort();
    $('festivos').value = fest.map(dmy).join('\n');
    const av = datos.avisos.slice();
    if (datos.ini < '2026-08-01') av.push('El período es anterior a agosto de 2026: esta calculadora usa jornada de 42 h y dominical 90 %, que pueden no aplicar.');
    $('avisos').innerHTML = av.map(t => `<div class="aviso">⚠️ ${t}</div>`).join('');
    $('tablaEmpleados').innerHTML = '<tr><th>Empleado</th><th>Salario mensual (COP)</th><th>Dom/fest compensados con descanso</th></tr>' +
        datos.emps.map((e, i) => `<tr><td>${e.nombre}</td>
            <td><input type="text" inputmode="numeric" data-sal="${i}" value="${fmt(+localStorage.getItem('sal:' + e.nombre) || SMMLV)}"></td>
            <td><input type="checkbox" data-comp="${i}" ${e.descansos ? 'checked' : ''}>
            ${e.descansos ? '' : '<span class="info">sin descansos en el período</span>'}</td></tr>`).join('');
    $('config').hidden = $('resultados').hidden = false;
    render();
}

function render() {
    const fest = new Set(($('festivos').value.match(/\d{1,2}\/\d{1,2}\/\d{4}/g) || []).map(fecha));
    let total = 0, html = '';
    datos.emps.forEach((e, i) => {
        const sal = +($(`[data-sal="${i}"]`) || {}).value?.replace(/\D/g, '') || SMMLV;
        localStorage.setItem('sal:' + e.nombre, sal);
        const cfg = { almuerzo: +$('almuerzo').value || 0, diario: +$('diario').value || 8, semanal: +$('semanal').value || 42,
            festivos: fest, ini: datos.ini, fin: datos.fin, comp: $(`[data-comp="${i}"]`).checked, valorHora: sal / DIVISOR };
        const r = calcular(e, cfg); total += r.total;
        html += `<details class="emp"><summary><span><b>${e.nombre}</b><small>${hh(r.horas)} h trabajadas · ${hh(r.extra)} h extra · ${e.descansos} descansos · ${e.ausencias} ausencias</small></span>
            <b>COP ${fmt(r.total)}</b></summary>
            <table><tr><th>Concepto</th><th class="n">Horas</th><th class="n">Factor</th><th class="n">Valor</th></tr>` +
            r.rows.map(x => `<tr><td>${x.nombre}</td><td class="n">${hh(x.min)}</td><td class="n">${x.factor ? x.factor.toFixed(2) : '-'}</td><td class="n">${fmt(x.valor)}</td></tr>`).join('') +
            `</table></details>`;
    });
    $('total').innerHTML = `<div class="total">Total: COP ${fmt(total)}</div>`;
    $('detalle').innerHTML = html;
}

if (typeof document !== 'undefined') {
    $('archivo').addEventListener('change', e => e.target.files[0] && cargar(e.target.files[0]));
    ['almuerzo', 'diario', 'semanal', 'festivos'].forEach(id => $(id).addEventListener('input', () => datos && render()));
    $('tablaEmpleados').addEventListener('input', e => {
        if (e.target.dataset.sal !== undefined) e.target.value = fmt(+e.target.value.replace(/\D/g, '') || 0);
        render();
    });
}
if (typeof module !== 'undefined') module.exports = { parsear, calcular, festivos };
