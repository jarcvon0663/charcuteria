// ===== Normativa laboral colombiana, por fecha de vigencia =====
// Cada tabla es [fecha desde (aaaa-mm-dd), valor]. Se usa el valor vigente en la fecha de cada hora trabajada,
// así la calculadora sigue siendo correcta en los meses siguientes sin tocar el código.
const JORNADA_SEM = [['2000-01-01', 48], ['2023-07-15', 47], ['2024-07-15', 46], ['2025-07-15', 44], ['2026-07-15', 42]]; // Ley 2101 de 2021
const REC_DOMFEST = [['2000-01-01', 0.75], ['2025-07-01', 0.80], ['2026-07-01', 0.90], ['2027-07-01', 1.00]];             // Ley 2466 de 2025
const INICIO_NOCHE = [['2000-01-01', 21], ['2025-12-25', 19]];                                                              // Ley 2466 de 2025 (hora en que empieza el trabajo nocturno)
const SMMLV_ANUAL = { 2023: 1160000, 2024: 1300000, 2025: 1423500, 2026: 1750905 };                                        // Salario mínimo por defecto
const vigente = (tabla, f) => tabla.reduce((v, [d, x]) => (f >= d ? x : v), tabla[0][1]);
const ANIOS_SMMLV = Object.keys(SMMLV_ANUAL).map(Number);
const salarioMinimo = f => SMMLV_ANUAL[Math.min(Math.max(+f.slice(0, 4), Math.min(...ANIOS_SMMLV)), Math.max(...ANIOS_SMMLV))];
const REC_NOC = 0.35, EXT_D = 0.25, EXT_N = 0.75, DAY = 864e5;
const MES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
// Factor sobre la hora ordinaria que se paga ADEMÁS del salario mensual (c = dom/fest compensado, d = recargo dom/fest del día)
const CATS = {
    O:   ['Ordinarias diurnas', () => 0],
    ON:  ['Recargo nocturno', () => REC_NOC],
    OD:  ['Recargo dom/fest diurno', (c, d) => c ? d : 1 + d],
    ODN: ['Recargo dom/fest nocturno', (c, d) => c ? REC_NOC + d : 1 + REC_NOC + d],
    E:   ['Extra diurna', () => 1 + EXT_D],
    EN:  ['Extra nocturna', () => 1 + EXT_N],
    ED:  ['Extra diurna dom/fest', (c, d) => 1 + EXT_D + d],
    EDN: ['Extra nocturna dom/fest', (c, d) => 1 + EXT_N + d]
};
const iso = t => new Date(t).toISOString().slice(0, 10);
const dmy = s => s.split('-').reverse().join('/');
const pad = n => String(n).padStart(2, '0');
const fmt = n => Math.round(n).toLocaleString('es-CO');
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hh = m => (m / 60).toFixed(2).replace('.', ',');
const norm = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const MESN = MES.map(norm);
const DIAS = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
const horaTxt = h => `${h % 12 || 12}:00 ${h >= 12 ? 'p.m.' : 'a.m.'}`;

function lineasReglas(p) {
    const pct = x => Math.round(x * 100);
    return [
        `Valor hora = salario ÷ ${p.divisor} (jornada de ${p.semanal} horas semanales).`,
        `Recargo nocturno (de ${horaTxt(p.nocIni)} a 6:00 a.m.): ${pct(REC_NOC)} %. Dominical y festivo: ${pct(p.recDom)} %. Extra diurna ${pct(EXT_D)} %, extra nocturna ${pct(EXT_N)} %.`,
        `Jornada diaria de ${p.diario} h; almuerzo de ${p.almuerzo} min por día trabajado.`
    ];
}

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

// ===== Lectura flexible del Excel =====
// Entiende fechas completas (dd/mm/aaaa, aaaa-mm-dd, serial de Excel) y también "1 - Jueves", "Jueves 1", "12 - Lunes festivo" o solo "1".
function celdaFecha(v) {
    if (v instanceof Date) return { iso: iso(v.getTime()) };
    if (typeof v === 'number') {
        if (v > 20000) return { iso: iso(Math.round((v - 25569) * DAY)) };
        return Number.isInteger(v) && v >= 1 && v <= 31 ? { dia: v } : null;
    }
    if (typeof v !== 'string') return null;
    const t = v.trim();
    let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return { iso: `${m[3]}-${pad(m[2])}-${pad(m[1])}` };
    m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return { iso: `${m[1]}-${m[2]}-${m[3]}` };
    m = t.match(/^(?:([A-Za-zÁÉÍÓÚáéíóúÑñ]+)\.?\s+)?(\d{1,2})(?:\s*[-–—.:]\s*(.*))?$/);
    if (!m || +m[2] < 1 || +m[2] > 31) return null;
    const resto = norm(`${m[1] || ''} ${m[3] || ''}`);
    const sem = Object.keys(DIAS).find(d => resto.includes(d));
    return { dia: +m[2], semana: sem === undefined ? null : DIAS[sem], festivo: /festiv/.test(resto) };
}
const fecha = v => (celdaFecha(v) || {}).iso || null;

function hora(v) {
    if (typeof v === 'number' && v >= 0 && v <= 1) return Math.round(v * 1440) % 1440;
    if (typeof v !== 'string') return null;
    const m = v.trim().match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*([ap])?\.?\s*m?\.?$/i);
    if (!m) return null;
    let h = +m[1]; const mi = +m[2];
    if (m[3]) { h %= 12; if (/p/i.test(m[3])) h += 12; }
    return h > 24 || mi > 59 ? null : (h * 60 + mi) % 1440;
}

const limpiarNombre = a => a.replace(/\s+(?:c\.?\s?c\.?|c[eé]dula|nit)\s*[:.]?\s*\d.*$/i, '').replace(/\s+/g, ' ').trim();

// Busca el mes, el año y (si existe) el rango de días en el título del archivo o en el nombre de la hoja.
function detectarPeriodo(R, hoja) {
    const textos = R.slice(0, 8).map(r => r && r[0]).filter(t => typeof t === 'string').concat(hoja ? [hoja] : []);
    const M = `(${MESN.join('|')})`, A = '(?:\\s+de(?:l)?\\s+(20\\d{2}))?';
    for (const t of textos) {
        const n = norm(t);
        let m = n.match(new RegExp(`(\\d{1,2})\\s+de\\s+${M}${A}\\s+(?:al|a|hasta)\\s+(?:el\\s+)?(\\d{1,2})\\s+de\\s+${M}${A}`));
        if (m) {
            const mes = MESN.indexOf(m[2]) + 1, mes2 = MESN.indexOf(m[5]) + 1;
            const anio = +m[3] || (+m[6] ? (mes > mes2 ? +m[6] - 1 : +m[6]) : null);
            return { d1: +m[1], d2: +m[4], mes, mes2, anio };
        }
        m = n.match(new RegExp(`(\\d{1,2})\\s*(?:al|a|hasta|-)\\s*(\\d{1,2})\\s+de\\s+${M}${A}`));
        if (m) return { d1: +m[1], d2: +m[2], mes: MESN.indexOf(m[3]) + 1, mes2: MESN.indexOf(m[3]) + 1, anio: +m[4] || null };
        m = n.match(new RegExp(`\\b${M}\\b(?:\\s+de)?(?:\\s+(20\\d{2}))?`));
        if (m) return { mes: MESN.indexOf(m[1]) + 1, anio: +m[2] || +((n.match(/\b(20\d{2})\b/) || [])[1]) || null };
    }
    return null;
}

function parsear(R, opts = {}, hoja = '') {
    const out = { restaurante: '', almuerzo: 45, ini: null, fin: null, mes: null, anio: null, emps: [], avisos: [], festivosArchivo: [] };
    const t0 = R.slice(0, 8).map(r => r && r[0]).find(t => typeof t === 'string' && /\s[·•|–—-]\s|horas/i.test(t));
    out.restaurante = t0 ? t0.split(/\s[·•|–—-]\s/)[0].trim() : '';

    // --- Período (mes y año) ---
    const p = detectarPeriodo(R, hoja), hoy = new Date();
    let mes = opts.mes || (p && p.mes), anio = opts.anio || (p && p.anio);
    if (!mes) { mes = hoy.getMonth() + 1; out.avisos.push(`No pude detectar el mes del archivo; usé ${MES[mes - 1]}. Corrígelo en el campo "Período".`); }
    if (!anio) { anio = hoy.getFullYear(); if (!opts.anio) out.avisos.push(`El archivo no indica el año; usé ${anio}. Corrígelo en el campo "Período" si no es el correcto.`); }
    out.mes = mes; out.anio = anio;
    const rango = p && p.d1 && p.mes === p.mes2 ? [p.d1, p.d2] : null;

    // --- Empleados y horas ---
    const dia2iso = (dia, st) => {
        if (st.prev && dia < st.prev) { st.m++; if (st.m > 12) { st.m = 1; st.y++; } } // el período pasa al mes siguiente
        st.prev = dia;
        const d = new Date(Date.UTC(st.y, st.m - 1, dia));
        return d.getUTCMonth() === st.m - 1 ? `${st.y}-${pad(st.m)}-${pad(dia)}` : null;
    };
    let cur = null, st = null, ultima = null, desfase = 0;
    const resumen = []; let enResumen = false;
    R.forEach((r, i) => {
        r = r || [];
        const a = r[0], sig = R[i + 1] || [];
        if (typeof a === 'string' && /^almuerzo/i.test(a.trim())) { const n = r.slice(1).find(x => typeof x === 'number'); if (n != null) out.almuerzo = n; }
        if (typeof a === 'string' && /^empleado/i.test(a.trim()) && /total/i.test(String(r[1]))) { enResumen = true; return; }
        if (enResumen) { if (typeof a !== 'string' || /^total/i.test(a.trim())) enResumen = false; else { resumen.push(a.trim()); return; } }
        if (typeof a === 'string' && /^fecha$/i.test(String(sig[0]).trim()) && /entrada/i.test(String(sig[1]))) {
            cur = { nombre: limpiarNombre(a), dias: {}, descansos: 0, ausencias: 0, fechas: [] };
            out.emps.push(cur); st = { m: mes, y: anio, prev: 0 }; ultima = null; return;
        }
        if (!cur) return;
        if (typeof a === 'string' && /^total/i.test(a.trim())) { cur = null; return; }
        if (typeof a === 'string' && /^fecha$/i.test(a.trim())) return;
        const c = celdaFecha(a), e = hora(r[1]), s = hora(r[2]);
        let f = null;
        if (c) {
            f = c.iso || dia2iso(c.dia, st);
            if (!f) { desfase++; return; }
            if (c.semana != null && new Date(f + 'T00:00:00Z').getUTCDay() !== c.semana) desfase++;
            if (c.festivo) out.festivosArchivo.push(f);
        } else if ((a == null || a === '') && e != null && s != null && ultima) f = ultima; // segunda fila de un turno partido
        if (!f) return;
        ultima = f;
        const nota = typeof r[1] === 'string' ? r[1].trim() : '';
        if (e != null && s != null) { (cur.dias[f] = cur.dias[f] || []).push([e, s]); cur.fechas.push(f); }
        else if (nota) {
            /aus|no asisti|incap|permiso|licen|vacac/.test(norm(nota)) ? cur.ausencias++ : cur.descansos++;
            cur.fechas.push(f);
        }
    });

    // --- Rango del período ---
    const todas = out.emps.flatMap(e => e.fechas).sort();
    if (rango) { out.ini = `${anio}-${pad(mes)}-${pad(rango[0])}`; out.fin = `${anio}-${pad(mes)}-${pad(rango[1])}`; }
    else if (todas.length) { out.ini = todas[0]; out.fin = todas[todas.length - 1]; }
    if (!out.ini) { out.ini = `${anio}-${pad(mes)}-01`; out.fin = `${anio}-${pad(mes)}-${pad(new Date(Date.UTC(anio, mes, 0)).getUTCDate())}`; }

    // --- Avisos para que Claudia detecte errores del archivo ---
    if (desfase) out.avisos.push(`${desfase} fecha(s) no coinciden con el día de la semana escrito en el archivo (por ejemplo, "1 - Jueves"). Verifica el mes y el año en el campo "Período".`);
    out.emps.forEach(e => {
        const fuera = e.fechas.filter(f => f < out.ini || f > out.fin);
        if (fuera.length) {
            out.avisos.push(`${e.nombre}: ${fuera.length === 1 ? 'la fecha ' + dmy(fuera[0]) + ' está' : 'hay ' + fuera.length + ' fechas'} fuera del período (${dmy(out.ini)} a ${dmy(out.fin)}); se ignoró. Revisa si es un error de digitación.`);
            fuera.forEach(f => delete e.dias[f]);
        }
        if (!Object.keys(e.dias).length) out.avisos.push(`${e.nombre}: no tiene horas registradas en este período.`);
    });
    resumen.forEach(n => {
        const nn = norm(n);
        if (!out.emps.some(e => { const b = norm(e.nombre); return b.startsWith(nn) || nn.startsWith(b); }))
            out.avisos.push(`El resumen del Excel menciona a "${n}", pero no hay una tabla de horas con ese nombre. Revisa si cambió el nombre de un empleado.`);
    });
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
    min.forEach(o => { // cada hora se clasifica con la normativa vigente en SU fecha
        const d = new Date(o.m * 60000), h = d.getUTCHours(), f = iso(o.m * 60000);
        const dom = d.getUTCDay() === 0 || cfg.festivos.has(f);
        const k = (o.ext ? 'E' : 'O') + (dom ? 'D' : '') + (h >= vigente(INICIO_NOCHE, f) || h < 6 ? 'N' : '');
        const fac = CATS[k][1](cfg.comp, vigente(REC_DOMFEST, f));
        const a = acc[k] = acc[k] || { min: 0, fs: 0 };
        a.min++; a.fs += fac;
    });
    const rows = Object.keys(CATS).filter(k => acc[k]).map(k => {
        const factor = acc[k].fs / acc[k].min;
        return { nombre: CATS[k][0], min: acc[k].min, factor, valor: acc[k].min / 60 * cfg.valorHora * factor };
    });
    return {
        rows, total: rows.reduce((s, r) => s + r.valor, 0), horas: min.length,
        extra: rows.filter(r => /^Extra/.test(r.nombre)).reduce((s, r) => s + r.min, 0)
    };
}

// ===== Interfaz =====
let datos = null;
const $ = id => id[0] === '[' ? document.querySelector(id) : document.getElementById(id);
const iniciales = n => n.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
const guardado = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } };

const claveNombre = n => norm(n).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
function leerSalario(nombre) {
    const k = claveNombre(nombre);
    const exacto = +guardado('sal:' + k) || +guardado('sal:' + nombre);
    if (exacto) return exacto;
    try { // coincidencia por nombre parcial, solo si es única (evita confundir "Juan Pablo" con "Juan Manuel")
        const c = Object.keys(localStorage).filter(x => x.startsWith('sal:')).map(x => x.slice(4))
            .filter(x => x.startsWith(k + ' ') || k.startsWith(x + ' '));
        return c.length === 1 ? +localStorage.getItem('sal:' + c[0]) || 0 : 0;
    } catch (e) { return 0; }
}
const guardarSalario = (nombre, v) => guardar('sal:' + claveNombre(nombre), v);

function estado(msg, tipo) { const e = $('estado'); e.textContent = msg; e.className = 'estado' + (tipo ? ' ' + tipo : ''); }

let fuente = null;

function cargar(file) {
    if (!/\.xlsx?$/i.test(file.name)) return estado('Elige un archivo de Excel (.xlsx o .xls).', 'error');
    estado('Leyendo el archivo…');
    const rd = new FileReader();
    rd.onload = ev => {
        try {
            const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
            const hojas = wb.SheetNames
                .map(n => ({ n, R: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null }) }))
                .map(h => ({ ...h, d: parsear(h.R, {}, h.n) }))
                .filter(h => h.d.emps.length);
            if (!hojas.length) throw new Error('No encontré empleados. Cada empleado debe tener su tabla con las columnas Fecha, Entrada y Salida.');
            const h = hojas[0];
            fuente = { R: h.R, hoja: h.n, archivo: file.name,
                extra: hojas.length > 1 ? [`El archivo tiene varias hojas con horas (${hojas.map(x => x.n).join(', ')}). Se leyó la hoja "${h.n}".`] : [] };
            datos = h.d;
            iniciar(file.name);
        } catch (err) { estado(err.message, 'error'); }
    };
    rd.onerror = () => estado('No pude leer el archivo. Intenta de nuevo.', 'error');
    rd.readAsArrayBuffer(file);
}

function cambiarPeriodo() {
    const mes = +$('periodoMes').value, anio = +$('periodoAnio').value;
    if (!fuente || !mes || !(anio >= 2000 && anio <= 2100)) return;
    datos = parsear(fuente.R, { mes, anio }, fuente.hoja);
    iniciar(fuente.archivo);
}

// "LA CHARCUTERIE" -> "La Charcuterie" cuando el nombre viene todo en mayúsculas
const nombreLegible = n => n === n.toUpperCase() ? n.toLowerCase().replace(/(^|\s)\p{L}/gu, m => m.toUpperCase()) : n;

function iniciar(archivo) {
    document.body.classList.add('cargado');
    $('restaurante').innerHTML = `<b>${esc(nombreLegible(datos.restaurante || 'Restaurante'))}</b><span>${dmy(datos.ini)} al ${dmy(datos.fin)}</span>`;
    $('dropTitulo').textContent = archivo;
    $('dropSub').textContent = `${datos.emps.length} empleados leídos`;
    $('dropBoton').textContent = 'Cambiar archivo';
    estado('');
    $('periodoMes').value = datos.mes; $('periodoAnio').value = datos.anio;
    $('almuerzo').value = datos.almuerzo;
    $('semanal').value = vigente(JORNADA_SEM, datos.fin);
    const fest = new Set(datos.festivosArchivo);
    for (let y = +datos.ini.slice(0, 4); y <= +datos.fin.slice(0, 4); y++) festivos(y).forEach(f => fest.add(f));
    $('festivos').value = [...fest].filter(f => f >= datos.ini && f <= datos.fin).sort().map(dmy).join('\n');

    datos.smmlv = salarioMinimo(datos.fin);
    const av = datos.avisos.concat((fuente && fuente.extra) || []);
    if (vigente(JORNADA_SEM, datos.ini) !== vigente(JORNADA_SEM, datos.fin))
        av.push(`En este período cambió la jornada semanal (de ${vigente(JORNADA_SEM, datos.ini)} h a ${vigente(JORNADA_SEM, datos.fin)} h). Se usa la jornada vigente al final del período; ajústala en "Ajustes del cálculo" si lo necesitas.`);
    if (+datos.fin.slice(0, 4) > Math.max(...ANIOS_SMMLV))
        av.push(`Aún no tengo el salario mínimo de ${datos.fin.slice(0, 4)}. Los empleados sin salario guardado empiezan con el de ${Math.max(...ANIOS_SMMLV)}: escribe el salario real de cada uno.`);
    $('avisos').innerHTML = av.map(t => `<div class="aviso"><b>Revisa:</b>${esc(t)}</div>`).join('');

    $('tablaEmpleados').innerHTML = datos.emps.map((e, i) => `<div class="emp-fila">
        <span class="emp-nombre">${esc(e.nombre)}</span>
        <label class="campo"><span>Salario mensual (COP)</span>
            <input type="text" inputmode="numeric" data-sal="${i}" value="${fmt(leerSalario(e.nombre) || datos.smmlv)}"></label>
        <label class="check"><input type="checkbox" data-comp="${i}" ${e.descansos ? 'checked' : ''}>
            <span>Dom/fest compensados con descanso${e.descansos ? '' : ' (no tuvo descansos en el período)'}</span></label>
    </div>`).join('');
    $('config').hidden = $('resultados').hidden = false;
    render();
}

function pintarReglas(reg) {
    const l = lineasReglas(reg);
    $('reglasTexto').innerHTML = [
        'Los valores son <b>adicionales al salario mensual</b>.', ...l.map(esc),
        'Extra: horas por encima de la jornada diaria y, en semanas completas (lunes a domingo) dentro del período, de la semanal.',
        'El almuerzo se descuenta una vez por día, del primer turno y hacia la mitad del mismo.',
        'Dom/fest compensado (el empleado tuvo un día de descanso): solo se paga el recargo. Si no, se paga la hora completa más el recargo.',
        'Los porcentajes y el horario nocturno cambian solos según la fecha de cada hora trabajada (Ley 2101 de 2021 y Ley 2466 de 2025).'
    ].map(t => `<li>${t}</li>`).join('');
    $('ayudaValorHora').textContent = `Valor hora = salario ÷ ${reg.divisor} (jornada de ${reg.semanal} h semanales). Si no escribes el salario de un empleado se usa el salario mínimo.`;
}

let ultimo = null;

function render() {
    const fest = new Set(($('festivos').value.match(/\d{1,2}\/\d{1,2}\/\d{4}/g) || []).map(fecha));
    const base = { almuerzo: +$('almuerzo').value || 0, diario: +$('diario').value || 8, semanal: +$('semanal').value || vigente(JORNADA_SEM, datos.fin) };
    const reg = { ...base, divisor: base.semanal * 5, recDom: vigente(REC_DOMFEST, datos.fin), nocIni: vigente(INICIO_NOCHE, datos.fin) };
    const res = datos.emps.map((e, i) => {
        const sal = +String($(`[data-sal="${i}"]`).value).replace(/\D/g, '') || datos.smmlv;
        const comp = $(`[data-comp="${i}"]`).checked;
        const cfg = { ...base, festivos: fest, ini: datos.ini, fin: datos.fin, comp, valorHora: sal / reg.divisor };
        return { e, r: calcular(e, cfg), sal, comp };
    });
    const total = res.reduce((s, x) => s + x.r.total, 0);
    const horas = res.reduce((s, x) => s + x.r.horas, 0), extra = res.reduce((s, x) => s + x.r.extra, 0);
    ultimo = { res, total, horas, extra, base, reg, festivos: [...fest].sort() };
    pintarReglas(reg);
    const mayor = Math.max(...res.map(x => x.r.total), 1);
    $('total').innerHTML = `<div class="resumen">
        <span class="etq">Total a pagar, adicional al salario mensual</span>
        <strong>COP ${fmt(total)}</strong>
        <dl class="stats">
            <div><dt>Empleados</dt><dd>${res.length}</dd></div>
            <div><dt>Horas trabajadas</dt><dd>${hh(horas)}</dd></div>
            <div><dt>Horas extra</dt><dd>${hh(extra)}</dd></div>
        </dl></div>`;
    $('detalle').innerHTML = res.map(({ e, r }) => `<details class="emp"><summary>
        <span class="avatar" aria-hidden="true">${esc(iniciales(e.nombre))}</span>
        <span class="emp-info"><b>${esc(e.nombre)}</b>
            <small>${hh(r.horas)} h trabajadas, ${hh(r.extra)} h extra, ${e.descansos} descansos, ${e.ausencias} ausencias</small>
            <span class="barra"><i style="width:${Math.round(r.total / mayor * 100)}%"></i></span></span>
        <span class="emp-valor">COP ${fmt(r.total)}</span><span class="chev" aria-hidden="true"></span></summary>
        <div class="tabla-wrap"><table><tr><th>Concepto</th><th class="n">Horas</th><th class="n col-factor">Factor</th><th class="n">Valor</th></tr>` +
        r.rows.map(x => `<tr><td>${x.nombre}</td><td class="n">${hh(x.min)}</td><td class="n col-factor">${x.factor ? x.factor.toFixed(2) : '-'}</td><td class="n">${fmt(x.valor)}</td></tr>`).join('') +
        `</table></div></details>`).join('');
}

// ===== Reporte: Excel y PDF =====
function armarReporte() {
    const u = ultimo;
    const nombre = nombreLegible(datos.restaurante || 'Restaurante');
    const slug = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
    return {
        nombre, periodo: `${dmy(datos.ini)} al ${dmy(datos.fin)}`,
        archivo: `Horas_extras_${slug}_${datos.ini}_a_${datos.fin}`,
        total: u.total, horas: u.horas / 60, extra: u.extra / 60,
        filas: u.res.map(({ e, r, sal, comp }) => ({
            nombre: e.nombre, sal, valorHora: sal / u.reg.divisor, horas: r.horas / 60, extra: r.extra / 60,
            total: r.total, comp, descansos: e.descansos, ausencias: e.ausencias,
            conceptos: r.rows.filter(x => x.valor > 0).map(x => ({ concepto: x.nombre, horas: x.min / 60, factor: x.factor, valor: x.valor }))
        })),
        params: { ...u.base, divisor: u.reg.divisor, recDom: u.reg.recDom, nocIni: u.reg.nocIni, festivos: u.festivos.map(dmy) }
    };
}

function crearExcel(ExcelJS, rep) {
    const VERDE = 'FF0E3B35', MENTA = 'FFDCEBE6';
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Horas extras'; wb.created = new Date();
    const encabezado = (fila, n) => {
        fila.height = 24;
        for (let c = 1; c <= n; c++) {
            const x = fila.getCell(c);
            x.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
            x.alignment = { vertical: 'middle', horizontal: c === 1 ? 'left' : 'right', wrapText: true };
        }
    };
    const totalFila = (fila, n) => {
        for (let c = 1; c <= n; c++) {
            const x = fila.getCell(c);
            x.font = { bold: true, color: { argb: VERDE } };
            x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTA } };
        }
    };

    // --- Resumen ---
    const ws = wb.addWorksheet('Resumen', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] });
    ws.columns = [{ width: 36 }, { width: 18 }, { width: 14 }, { width: 16 }, { width: 14 }, { width: 20 }, { width: 18 }];
    ws.mergeCells('A1:G1'); ws.getCell('A1').value = `${rep.nombre}: horas extras y recargos`;
    ws.getCell('A1').font = { bold: true, size: 16, color: { argb: VERDE } };
    ws.mergeCells('A2:G2'); ws.getCell('A2').value = `Período del ${rep.periodo}. Valores adicionales al salario mensual (COP).`;
    ws.getCell('A2').font = { color: { argb: 'FF566763' } };
    const h = ws.getRow(4);
    h.values = ['Empleado', 'Salario mensual', 'Valor hora', 'Horas trabajadas', 'Horas extra', 'Total a pagar', 'Dom/fest compensado'];
    encabezado(h, 7);
    rep.filas.forEach((f, i) => {
        const r = ws.getRow(5 + i);
        r.values = [f.nombre, f.sal, f.valorHora, f.horas, f.extra, f.total, f.comp ? 'Sí' : 'No'];
        [2, 3, 6].forEach(c => { r.getCell(c).numFmt = '#,##0'; });
        [4, 5].forEach(c => { r.getCell(c).numFmt = '0.00'; });
        r.getCell(7).alignment = { horizontal: 'right' };
        for (let c = 1; c <= 7; c++) r.getCell(c).border = { bottom: { style: 'thin', color: { argb: 'FFD3E2DD' } } };
    });
    const fin = 4 + rep.filas.length, t = ws.getRow(fin + 1);
    t.getCell(1).value = 'Total';
    t.getCell(4).value = { formula: `SUM(D5:D${fin})`, result: rep.horas };
    t.getCell(5).value = { formula: `SUM(E5:E${fin})`, result: rep.extra };
    t.getCell(6).value = { formula: `SUM(F5:F${fin})`, result: rep.total };
    t.getCell(4).numFmt = t.getCell(5).numFmt = '0.00'; t.getCell(6).numFmt = '#,##0';
    totalFila(t, 7);

    // --- Detalle ---
    const wd = wb.addWorksheet('Detalle', { views: [{ state: 'frozen', ySplit: 1 }] });
    wd.columns = [{ width: 36 }, { width: 32 }, { width: 12 }, { width: 10 }, { width: 18 }];
    const hd = wd.getRow(1); hd.values = ['Empleado', 'Concepto', 'Horas', 'Factor', 'Valor a pagar']; encabezado(hd, 5);
    let n = 1;
    rep.filas.forEach(f => {
        const items = f.conceptos.length ? f.conceptos : [{ concepto: 'Sin horas extras ni recargos', horas: 0, factor: null, valor: 0 }];
        items.forEach(c => {
            const r = wd.getRow(++n);
            r.values = [f.nombre, c.concepto, c.horas, c.factor, c.valor];
            r.getCell(3).numFmt = '0.00'; r.getCell(4).numFmt = '0.00'; r.getCell(5).numFmt = '#,##0';
        });
    });
    const td = wd.getRow(n + 1);
    td.getCell(1).value = 'Total';
    td.getCell(5).value = { formula: `SUM(E2:E${n})`, result: rep.total }; td.getCell(5).numFmt = '#,##0';
    totalFila(td, 5);
    wd.autoFilter = { from: 'A1', to: `E${n}` };

    // --- Parámetros ---
    const wp = wb.addWorksheet('Parámetros', { views: [{ showGridLines: false }] });
    wp.columns = [{ width: 44 }, { width: 40 }];
    const hp = wp.getRow(1); hp.values = ['Parámetro', 'Valor']; encabezado(hp, 2);
    const p = rep.params;
    [
        [`Divisor mensual de horas (jornada de ${p.semanal} h)`, p.divisor],
        ['Recargo nocturno', REC_NOC],
        ['Inicio del horario nocturno', horaTxt(p.nocIni)],
        ['Recargo dominical y festivo (al final del período)', p.recDom],
        ['Extra diurna', EXT_D],
        ['Extra nocturna', EXT_N],
        ['Jornada diaria (h)', p.diario],
        ['Jornada semanal (h)', p.semanal],
        ['Almuerzo descontado (min por día)', p.almuerzo],
        ['Festivos del período', p.festivos.length ? p.festivos.join(', ') : 'Ninguno']
    ].forEach(([k, v], i) => {
        const r = wp.getRow(2 + i); r.values = [k, v];
        if (typeof v === 'number' && v < 1) r.getCell(2).numFmt = '0%';
        r.getCell(2).alignment = { horizontal: 'right', wrapText: true };
    });
    wp.getRow(12).getCell(1).value = 'Cálculo de referencia: valídalo con tu contador antes de pagar.';
    wp.getRow(12).getCell(1).font = { italic: true, color: { argb: 'FF566763' } };
    return wb;
}

function crearPDF(jsPDF, rep) {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40;
    const VERDE = [14, 59, 53], MENTA = [220, 235, 230], TENUE = [86, 103, 99];
    const peso = v => '$ ' + fmt(v);

    doc.setFillColor(...VERDE); doc.rect(0, 0, W, 92, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
    doc.text('Horas extras y recargos', M, 42);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
    doc.text(`${rep.nombre}   |   Período del ${rep.periodo}`, M, 64);

    doc.setTextColor(...TENUE); doc.setFontSize(10);
    doc.text('Total a pagar, adicional al salario mensual', M, 122);
    doc.setTextColor(...VERDE); doc.setFont('helvetica', 'bold'); doc.setFontSize(26);
    doc.text(peso(rep.total), M, 150);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...TENUE);
    doc.text(`${rep.filas.length} empleados   |   ${hh(rep.horas * 60)} horas trabajadas   |   ${hh(rep.extra * 60)} horas extra`, M, 170);

    const estilos = {
        styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 5, textColor: [23, 33, 31] },
        headStyles: { fillColor: VERDE, textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: MENTA, textColor: VERDE, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [246, 250, 248] },
        margin: { left: M, right: M, bottom: 50 }
    };
    doc.autoTable({
        ...estilos, startY: 188,
        head: [['Empleado', 'Salario mensual', 'Horas trabajadas', 'Horas extra', 'Total a pagar']],
        body: rep.filas.map(f => [f.nombre, peso(f.sal), hh(f.horas * 60), hh(f.extra * 60), peso(f.total)]),
        foot: [['Total', '', hh(rep.horas * 60), hh(rep.extra * 60), peso(rep.total)]],
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
        didParseCell: d => { if (d.section === 'head' && d.column.index > 0) d.cell.styles.halign = 'right'; if (d.section === 'foot' && d.column.index > 0) d.cell.styles.halign = 'right'; }
    });

    let y = doc.lastAutoTable.finalY + 30;
    if (y > H - 140) { doc.addPage(); y = 50; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...VERDE);
    doc.text('Detalle por empleado', M, y);

    const anchos = { 0: { cellWidth: 230 }, 1: { cellWidth: 80, halign: 'right' }, 2: { cellWidth: 80, halign: 'right' }, 3: { cellWidth: 120, halign: 'right' } };
    let yy = y + 12;
    rep.filas.forEach(f => {
        const cuerpo = f.conceptos.length
            ? f.conceptos.map(c => [c.concepto, hh(c.horas * 60), c.factor.toFixed(2), peso(c.valor)])
            : [[{ content: 'Sin horas extras ni recargos en el período', colSpan: 4, styles: { fontStyle: 'italic', textColor: TENUE } }]];
        doc.autoTable({
            ...estilos, startY: yy, pageBreak: 'avoid', alternateRowStyles: { fillColor: [246, 250, 248] },
            head: [
                [{ content: f.nombre, colSpan: 3, styles: { fillColor: MENTA, textColor: VERDE, fontStyle: 'bold' } },
                 { content: peso(f.total), styles: { fillColor: MENTA, textColor: VERDE, fontStyle: 'bold', halign: 'right' } }],
                [{ content: 'Concepto', styles: { fillColor: 255, textColor: TENUE, fontStyle: 'normal', fontSize: 8 } },
                 { content: 'Horas', styles: { fillColor: 255, textColor: TENUE, fontStyle: 'normal', fontSize: 8, halign: 'right' } },
                 { content: 'Factor', styles: { fillColor: 255, textColor: TENUE, fontStyle: 'normal', fontSize: 8, halign: 'right' } },
                 { content: 'Valor', styles: { fillColor: 255, textColor: TENUE, fontStyle: 'normal', fontSize: 8, halign: 'right' } }]
            ],
            showHead: 'firstPage', body: cuerpo, columnStyles: anchos
        });
        yy = doc.lastAutoTable.finalY + 10;
    });

    const p = rep.params;
    const notas = [
        'Los valores son adicionales al salario mensual.',
        ...lineasReglas(p),
        `Festivos considerados: ${p.festivos.length ? p.festivos.join(', ') : 'ninguno'}.`,
        'Cálculo de referencia: valídalo con tu contador antes de pagar.'
    ];
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...TENUE);
    const lineas = notas.flatMap(t => doc.splitTextToSize(t, W - 2 * M));
    y = yy + 12;
    if (y + lineas.length * 12 > H - 50) { doc.addPage(); y = 50; }
    doc.text(lineas, M, y, { lineHeightFactor: 1.4 });

    const hoy = new Date().toLocaleDateString('es-CO'), pags = doc.getNumberOfPages();
    for (let i = 1; i <= pags; i++) {
        doc.setPage(i); doc.setFontSize(8); doc.setTextColor(...TENUE);
        doc.text(`Generado el ${hoy}`, M, H - 24);
        doc.text(`Página ${i} de ${pags}`, W - M, H - 24, { align: 'right' });
    }
    return doc;
}

function bajar(blob, nombre) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function mensajeDescarga(txt, error) { const m = $('msgDescarga'); m.textContent = txt; m.className = 'msg' + (error ? ' error' : ''); }

async function descargar(tipo, btn) {
    if (!datos || !ultimo) return;
    const etiqueta = btn.querySelector('span'), original = etiqueta.textContent;
    mensajeDescarga(''); btn.disabled = true; etiqueta.textContent = 'Preparando…';
    try {
        const rep = armarReporte();
        if (tipo === 'excel') {
            if (typeof ExcelJS === 'undefined') throw new Error('lib');
            const buf = await crearExcel(ExcelJS, rep).xlsx.writeBuffer();
            bajar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), rep.archivo + '.xlsx');
        } else {
            const J = window.jspdf && window.jspdf.jsPDF;
            if (!J) throw new Error('lib');
            bajar(crearPDF(J, rep).output('blob'), rep.archivo + '.pdf');
        }
        mensajeDescarga(`${tipo === 'excel' ? 'Excel' : 'PDF'} descargado.`);
    } catch (err) {
        mensajeDescarga(err.message === 'lib'
            ? 'No se pudo cargar el generador del archivo. Revisa tu conexión a internet y recarga la página.'
            : 'No se pudo generar el archivo. Intenta de nuevo.', true);
    } finally { btn.disabled = false; etiqueta.textContent = original; }
}

if (typeof document !== 'undefined') {
    const drop = $('drop');
    $('archivo').addEventListener('change', e => { const f = e.target.files[0]; if (f) cargar(f); e.target.value = ''; });
    ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('arrastrando'); }));
    ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('arrastrando'); }));
    drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) cargar(f); });
    ['dragover', 'drop'].forEach(t => window.addEventListener(t, e => e.preventDefault())); // evita que el navegador abra el archivo
    ['almuerzo', 'diario', 'semanal', 'festivos'].forEach(id => $(id).addEventListener('input', () => datos && render()));
    $('btnExcel').addEventListener('click', e => descargar('excel', e.currentTarget));
    $('btnPdf').addEventListener('click', e => descargar('pdf', e.currentTarget));
    $('periodoMes').addEventListener('change', cambiarPeriodo);
    $('periodoAnio').addEventListener('change', cambiarPeriodo);
    $('tablaEmpleados').addEventListener('input', e => {
        if (e.target.dataset.sal !== undefined) {
            const v = +e.target.value.replace(/\D/g, '') || 0;
            e.target.value = fmt(v);
            if (v) guardarSalario(datos.emps[+e.target.dataset.sal].nombre, v); // se recuerda para los próximos meses
        }
        render();
    });
}
if (typeof module !== 'undefined') module.exports = { parsear, calcular, festivos, crearExcel, crearPDF, vigente, JORNADA_SEM, REC_DOMFEST, INICIO_NOCHE, celdaFecha, hora, limpiarNombre };
