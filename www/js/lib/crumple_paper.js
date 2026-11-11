/* 揉皱纸张展开（js/lib/crumple_paper.js）
   移植自 D:\A\html\ipa\揉皱纸张展开.html 的单张竖版：
   32×40 网格双顶点（揉皱团 / 平铺）+ 260 次距离约束松弛 + 多尺度折痕高度场 + 双 pass 真剪影阴影 + 弹簧 210/26。
   纸面内容（字）画进纹理，所以展开时字会跟着纸一起变形。 */
(function () {
    'use strict';

    const SHEET = { w: 296, h: 374 };
    const BALL = { x: 76, y: 108, z: 84 };
    const TEX = { w: 1200, h: 1500 };
    const RELIEF = { w: 512, h: 640 };

    const STYLES = {
        note: { label: '白纸条', paper: '#f7f4ea', ink: '#31405c', rule: 'rgba(96,124,160,0.20)', grid: false, font: '"Kaiti SC","STKaiti","KaiTi","DFKai-SB","楷体",serif' },
        kraft: { label: '牛皮纸', paper: '#d8b98a', ink: '#3d2b1a', rule: 'rgba(110,78,42,0.16)', grid: false, font: '"Kaiti SC","STKaiti","KaiTi","DFKai-SB","楷体",serif' },
        grid: { label: '粉格纸', paper: '#fdf2f3', ink: '#8c3a55', rule: 'rgba(208,116,142,0.24)', grid: true, font: '"Kaiti SC","STKaiti","KaiTi","DFKai-SB","楷体",serif' }
    };

    const VS = `precision highp float;
attribute vec3 a_closed;attribute vec3 a_flat;attribute vec2 a_uv;
uniform float u_progress;uniform float u_pass;uniform vec2 u_size;uniform vec2 u_center;uniform float u_scale;
varying vec2 v_uv;varying vec3 v_position;
void main(){
float p=u_progress;vec3 pos=mix(a_closed,a_flat,p);
pos.z+=sin(p*3.14159265)*sin(a_uv.x*8.0+a_uv.y*11.0)*13.0;
v_position=pos;v_uv=a_uv;vec2 xy=pos.xy;
if(u_pass>0.5){float above=max(0.0,pos.z+mix(80.0,9.0,p));xy+=vec2(.23,.30)*above;}
float camera=u_pass>0.5?1.0:1000.0/(1000.0-pos.z);
vec2 screen=xy*camera*u_scale+u_center;
gl_Position=vec4(screen.x/u_size.x*2.0-1.0,1.0-screen.y/u_size.y*2.0,-pos.z/400.0,1.0);
}`;

    const FS = `#extension GL_OES_standard_derivatives : enable
precision highp float;
uniform sampler2D u_texture;uniform sampler2D u_relief;uniform float u_progress;uniform float u_pass;
varying vec2 v_uv;varying vec3 v_position;
vec3 toLinear(vec3 c){return pow(c,vec3(2.2));}
void main(){
if(u_pass>0.5){gl_FragColor=vec4(.17,.145,.11,1.0);return;}
vec3 dx=dFdx(v_position),dy=dFdy(v_position),n=normalize(cross(dx,dy));if(n.z<0.0)n=-n;
vec2 tx=dFdx(v_uv),ty=dFdy(v_uv);float determinant=tx.x*ty.y-tx.y*ty.x;
vec3 tangent=normalize((dx*ty.y-dy*tx.y)/determinant);
vec3 bitangent=normalize((dy*tx.x-dx*ty.x)/determinant);
vec3 crease=texture2D(u_relief,v_uv).rgb;
vec2 slope=(crease.rg*255.0-128.0)/100.0;
n=normalize(n-(tangent*slope.x+bitangent*slope.y)*mix(.48,.95,u_progress));
vec3 light=normalize(vec3(-.30,-.48,.82)),fill=normalize(vec3(.7,.15,.6));
float key=max(0.0,dot(n,light)),soft=max(0.0,dot(n,fill));
float lighting=mix(.12+.91*key+.10*soft,.30+.67*key+.12*soft,u_progress);
float rake=max(0.0,dot(n,normalize(vec3(-.55,-.78,.32))));
lighting+=u_progress*(rake-.32)*.16;
float occlusion=mix(.80+.20*smoothstep(-75.0,65.0,v_position.z),1.0,u_progress);
lighting*=occlusion*(1.0-crease.b*mix(.12,.055,u_progress));
vec3 ink=texture2D(u_texture,v_uv).rgb;
vec3 back=mix(vec3(.961,.946,.905),ink,.045);
vec3 color=toLinear(gl_FrontFacing?ink:back)*lighting;
vec3 halfLight=normalize(light+vec3(0.0,0.0,1.0));
float satin=pow(max(0.0,dot(n,halfLight)),38.0)*.045;
color+=vec3(satin);gl_FragColor=vec4(pow(max(color,vec3(0.0)),vec3(1.0/2.2)),1.0);
}`;

    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function random(seed) {
        return () => {
            seed |= 0; seed = seed + 0x6d2b79f5 | 0;
            let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
            t = t + Math.imul(t ^ t >>> 7, 61 | t);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    /* ---------- 几何（与纸条内容无关，整个会话只算一次） ---------- */
    let geo = null;
    function buildRelief() {
        const w = RELIEF.w, h = RELIEF.h;
        const field = new Float32Array(w * h), valley = new Float32Array(w * h);
        const rand = random(729);
        for (const [cols, rows, amplitude, groove] of [[11, 14, 2.4, .045], [23, 29, .52, .025], [45, 56, .10, .008]]) {
            const points = [];
            for (let y = 0; y <= rows; y++) {
                for (let x = 0; x <= cols; x++) {
                    points.push({
                        x: (x + (x && x < cols ? (rand() - .5) * .8 : 0)) * w / cols,
                        y: (y + (y && y < rows ? (rand() - .5) * .8 : 0)) * h / rows,
                        z: (rand() - .5) * amplitude * 2
                    });
                }
            }
            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    const a = y * (cols + 1) + x, b = a + 1, c = a + cols + 1, d = c + 1;
                    for (const ids of ((x + y) % 2 ? [[a, b, d], [a, d, c]] : [[a, b, c], [b, d, c]])) {
                        const [a, b, c] = ids.map((i) => points[i]);
                        const area = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
                        const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
                        const maxX = Math.min(w - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
                        const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
                        const maxY = Math.min(h - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
                        const altA = Math.abs(area) / Math.hypot(b.x - c.x, b.y - c.y);
                        const altB = Math.abs(area) / Math.hypot(a.x - c.x, a.y - c.y);
                        const altC = Math.abs(area) / Math.hypot(a.x - b.x, a.y - b.y);
                        for (let py = minY; py <= maxY; py++) {
                            for (let px = minX; px <= maxX; px++) {
                                const u = ((b.y - c.y) * (px + .5 - c.x) + (c.x - b.x) * (py + .5 - c.y)) / area;
                                const v = ((c.y - a.y) * (px + .5 - c.x) + (a.x - c.x) * (py + .5 - c.y)) / area;
                                const t = 1 - u - v;
                                if (u < 0 || v < 0 || t < 0) continue;
                                const at = py * w + px;
                                const edge = Math.min(u * altA, v * altB, t * altC);
                                const crease = Math.exp(-edge * edge / (groove > .15 ? 2.4 : 1.1));
                                field[at] += u * a.z + v * b.z + t * c.z - groove * crease;
                                valley[at] = Math.max(valley[at], crease * groove * 2.2);
                            }
                        }
                    }
                }
            }
        }
        // 两道老信纸折痕：圆底凹槽 + 旁边一道更细的隆起
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const at = y * w + x;
                for (const fold of [1 / 3, 2 / 3]) {
                    const d = y - h * (fold + (x / w - .5) * .006);
                    field[at] -= .28 * Math.exp(-d * d / 3.4);
                    field[at] += .13 * Math.exp(-(d - 2.1) * (d - 2.1) / 4.8);
                    valley[at] = Math.max(valley[at], .28 * Math.exp(-d * d / 2));
                }
            }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        const pixels = ctx.createImageData(w, h);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const at = y * w + x, i = at * 4;
                const dx = (field[y * w + Math.min(w - 1, x + 1)] - field[y * w + Math.max(0, x - 1)]) * .5 * w / 296;
                const dy = (field[Math.min(h - 1, y + 1) * w + x] - field[Math.max(0, y - 1) * w + x]) * .5 * h / 374;
                pixels.data[i] = clamp(Math.round(128 + dx * 100), 0, 255);
                pixels.data[i + 1] = clamp(Math.round(128 + dy * 100), 0, 255);
                pixels.data[i + 2] = clamp(Math.round(valley[at] * 255), 0, 255);
                pixels.data[i + 3] = 255;
            }
        }
        ctx.putImageData(pixels, 0, 0);
        return { canvas, field, w, h };
    }

    function buildGeometry() {
        const cols = 32, rows = 40, seed = 41;
        const relief = buildRelief();
        const rand = random(seed);
        const points = [], vertices = [];
        for (let y = 0; y <= rows; y++) {
            for (let x = 0; x <= cols; x++) {
                const u = (x + (x && x < cols ? (rand() - .5) * .7 : 0)) / cols;
                const v = (y + (y && y < rows ? (rand() - .5) * .7 : 0)) / rows;
                const cu = u - .5, cv = v - .5, rho = Math.hypot(cu, cv), angle = rho * 4.82;
                const fold = Math.sin(u * 31 + v * 10) * Math.sin(v * 28 - u * 8) * .12 + Math.sin(u * 65 - v * 23) * .048;
                const r = 1 + fold * .65;
                const closed = [Math.sin(angle) * (rho ? cu / rho : 0) * BALL.x * r,
                    Math.sin(angle) * (rho ? cv / rho : 0) * BALL.y * r,
                    Math.cos(angle) * 76 * r];
                closed[0] += Math.sin(v * 18) * 5.5;
                closed[1] += Math.sin(u * 17) * 4;
                const front = Math.max(0, Math.cos(angle * .65));
                closed[2] += (Math.sin(v * 25 + Math.sin(u * 12) * 1.8) * 17 + Math.sin(u * 34 - v * 7) * 9) * front;
                closed[0] += Math.sin(v * 25 + u * 15) * 5 * front;
                closed[1] += Math.sin(u * 25 - v * 11) * 5 * front;
                const at = Math.min(relief.h - 1, Math.floor(v * relief.h)) * relief.w + Math.min(relief.w - 1, Math.floor(u * relief.w));
                const edgeU = Math.sin(v * 33) * .55 + Math.sin(v * 63) * .24;
                const edgeV = Math.sin(u * 35) * .55 + Math.sin(u * 59) * .26;
                const flat = [(u - .5) * SHEET.w + edgeU, (v - .5) * SHEET.h + edgeV, relief.field[at] * .72 + Math.sin(u * 7 + v * 4) * .5];
                points.push([...closed, ...flat, u, v]);
            }
        }
        // 保住真实三角边长再往里压缩，多出来的面积只能 buckling 成折，而不是塌成一个光滑的球
        const constraints = [], seen = new Set();
        const idx = (x, y) => y * (cols + 1) + x;
        const edge = (a, b) => {
            const key = Math.min(a, b) * points.length + Math.max(a, b);
            if (seen.has(key)) return;
            seen.add(key);
            const p = points[a], q = points[b];
            constraints.push([a, b, Math.hypot(p[3] - q[3], p[4] - q[4]) * 1.48]);
        };
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const a = idx(x, y), b = a + 1, c = a + cols + 1, d = c + 1;
                edge(a, b); edge(a, c); edge(b, d); edge(c, d);
                if ((x + y) % 2) edge(a, d); else edge(b, c);
            }
        }
        for (let step = 0; step < 260; step++) {
            const reverse = step % 2;
            for (let j = 0; j < constraints.length; j++) {
                const [a, b, length] = constraints[reverse ? constraints.length - 1 - j : j];
                const p = points[a], q = points[b];
                const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2];
                const distance = Math.hypot(dx, dy, dz) || 1, t = (distance - length) / distance * .42;
                p[0] += dx * t; p[1] += dy * t; p[2] += dz * t;
                q[0] -= dx * t; q[1] -= dy * t; q[2] -= dz * t;
            }
            for (const p of points) {
                const r = Math.hypot(p[0] / BALL.x, p[1] / BALL.y, p[2] / BALL.z);
                if (r > 1) { const t = (1 / r - 1) * .68; p[0] += p[0] * t; p[1] += p[1] * t; p[2] += p[2] * t; }
            }
        }
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const a = idx(x, y), b = a + 1, c = a + cols + 1, d = c + 1;
                for (const at of ((x + y) % 2 ? [a, b, d, a, d, c] : [a, b, c, b, d, c])) vertices.push(...points[at]);
            }
        }
        // relief 画布要留到 open() 时才上传成纹理，这里不能提前释放
        return { data: new Float32Array(vertices), count: vertices.length / 8, relief };
    }

    /* ---------- 纸面纹理：纸条样式 + 手写排版的字 ---------- */
    const face = document.createElement('canvas');
    face.width = TEX.w; face.height = TEX.h;
    const faceCtx = face.getContext('2d');

    function wrap(ctx, text, maxW) {
        const out = [];
        for (const para of String(text).split(/\r?\n/)) {
            if (!para) { out.push(''); continue; }
            let line = '';
            for (const ch of para) {
                if (ctx.measureText(line + ch).width > maxW && line) { out.push(line); line = ch === ' ' ? '' : ch; }
                else line += ch;
            }
            out.push(line);
        }
        return out;
    }

    function paintFace(styleKey, text, font) {
        const st = STYLES[styleKey] || STYLES.note;
        const faceFont = String(font || st.font);
        const ctx = faceCtx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, TEX.w, TEX.h);
        ctx.fillStyle = st.paper;
        ctx.fillRect(0, 0, TEX.w, TEX.h);

        const rand = random(27);
        ctx.save();
        ctx.globalAlpha = .045;
        ctx.lineCap = 'round';
        for (let i = 0; i < 520; i++) {
            const x = rand() * TEX.w, y = rand() * TEX.h, len = 20 + rand() * 90, tilt = (rand() - .5) * .5;
            ctx.strokeStyle = rand() > .5 ? '#6b6152' : '#ffffff';
            ctx.lineWidth = 1 + rand() * 2;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(tilt) * len, y + Math.sin(tilt) * len);
            ctx.stroke();
        }
        ctx.restore();

        const margin = 130;
        let size = 78, lines = [], step = 104;
        for (;;) {
            ctx.font = size + 'px ' + faceFont;
            lines = wrap(ctx, text, TEX.w - margin * 2);
            step = Math.round(size * 1.45);
            if (lines.length * step <= TEX.h - margin * 2 - size || size <= 34) break;
            size -= 4;
        }

        ctx.save();
        ctx.strokeStyle = st.rule;
        ctx.lineWidth = 2;
        const firstBaseline = margin + size;
        if (st.grid) {
            const cell = Math.round(step / 1.6);
            for (let x = margin; x <= TEX.w - margin; x += cell) { ctx.beginPath(); ctx.moveTo(x, margin); ctx.lineTo(x, TEX.h - margin); ctx.stroke(); }
            for (let y = margin; y <= TEX.h - margin; y += cell) { ctx.beginPath(); ctx.moveTo(margin, y); ctx.lineTo(TEX.w - margin, y); ctx.stroke(); }
        } else {
            for (let y = firstBaseline; y <= TEX.h - margin; y += step) {
                ctx.beginPath();
                ctx.moveTo(margin - 20, y + size * .28);
                ctx.lineTo(TEX.w - margin + 20, y + size * .28);
                ctx.stroke();
            }
        }
        ctx.restore();

        ctx.font = size + 'px ' + faceFont;
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = st.ink;
        const jitter = random(913);
        let y = firstBaseline, n = 0;
        for (const line of lines) {
            if (line) {
                ctx.save();
                ctx.translate(margin + (jitter() - .5) * 4, y + (jitter() - .5) * 3);
                ctx.rotate((jitter() - .5) * .006);
                ctx.globalAlpha = .92;
                ctx.fillText(line, 0, 0);
                ctx.restore();
            }
            y += step;
            n++;
        }
        return { size, step, lines: n };
    }

    /* ---------- 运行时 ---------- */
    let overlay = null, stage = null, glCanvas = null, shadowCanvas = null;
    let gl = null, program = null, uniforms = null, attribs = null, buffer = null, faceTex = null, reliefTex = null;
    let state = null, frame = 0, last = 0, destroyed = false;
    let view = { w: 0, h: 0, dpr: 1, k: 1 };
    let current = null, anchor = null, onToggle = null;

    function shader(type, source) {
        const s = gl.createShader(type);
        gl.shaderSource(s, source);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
    }

    function uploadTexture(source) {
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        return texture;
    }

    function measure() {
        view.w = overlay.clientWidth || window.innerWidth;
        view.h = overlay.clientHeight || window.innerHeight;
        view.dpr = Math.min(2, window.devicePixelRatio || 1);
        view.k = Math.min(view.w * .84 / SHEET.w, view.h * .74 / SHEET.h);
        for (const c of [glCanvas, shadowCanvas]) {
            c.width = Math.round(view.w * view.dpr);
            c.height = Math.round(view.h * view.dpr);
        }
    }

    function renderPass(pass) {
        gl.viewport(0, 0, glCanvas.width, glCanvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(program);
        gl.uniform2f(uniforms.size, view.w, view.h);
        gl.uniform1f(uniforms.scale, view.k);
        gl.uniform1i(uniforms.texture, 0);
        gl.uniform1i(uniforms.relief, 1);
        gl.uniform1f(uniforms.pass, pass);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        for (const [name, size, offset] of [['closed', 3, 0], ['flat', 3, 12], ['uv', 2, 24]]) {
            gl.enableVertexAttribArray(attribs[name]);
            gl.vertexAttribPointer(attribs[name], size, gl.FLOAT, false, 32, offset);
        }
        gl.uniform1f(uniforms.progress, clamp(state.p, 0, 1));
        gl.uniform2f(uniforms.center, view.w / 2, view.h / 2);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, faceTex);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, reliefTex);
        gl.drawArrays(gl.TRIANGLES, 0, geo.count);
    }

    function draw() {
        if (destroyed) return;
        const ctx = shadowCanvas.getContext('2d');
        ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
        ctx.clearRect(0, 0, view.w, view.h);
        if (gl) {
            renderPass(1);
            ctx.save();
            ctx.filter = 'blur(' + 4 * view.k / 2 + 'px)';
            ctx.globalAlpha = .17;
            ctx.drawImage(glCanvas, 0, 0, view.w, view.h);
            ctx.filter = 'blur(' + 9 * view.k / 2 + 'px)';
            ctx.globalAlpha = .07;
            ctx.drawImage(glCanvas, 0, 0, view.w, view.h);
            ctx.restore();
            renderPass(0);
        } else {
            // 没有 WebGL 时只剩一张会缩放摊开的纸，保持功能可用
            const p = clamp(state.p, 0, 1), k = view.k * (.48 + p * .52);
            ctx.drawImage(face, view.w / 2 - SHEET.w / 2 * k, view.h / 2 - SHEET.h / 2 * k, SHEET.w * k, SHEET.h * k);
        }
    }

    function tick(time) {
        frame = 0;
        if (destroyed) return;
        const dt = Math.min(.032, (time - (last || time - 16)) / 1000);
        last = time;
        let moving = false;
        if (reduced()) { state.p = state.target; state.v = 0; }
        else {
            const steps = 3, h = dt / steps;
            for (let j = 0; j < steps; j++) {
                state.v += ((state.target - state.p) * 210 - state.v * 26) * h;
                state.p += state.v * h;
            }
            if (Math.abs(state.p - state.target) < .0002 && Math.abs(state.v) < .002) { state.p = state.target; state.v = 0; }
            else moving = true;
        }
        draw();
        if (moving) frame = requestAnimationFrame(tick);
        else last = 0;
    }

    function wake() { if (!frame && !destroyed) frame = requestAnimationFrame(tick); }

    function setTarget(next) {
        state.target = next;
        if (reduced()) { state.p = next; state.v = 0; draw(); }
        wake();
        if (onToggle) onToggle(next === 1);
    }

    function flipTo(rect, done) {
        if (!stage) return;
        const ball = SHEET.w * view.k * .34;
        const to = rect ? {
            x: (rect.left + rect.width / 2) - view.w / 2,
            y: (rect.top + rect.height / 2) - view.h / 2,
            s: clamp((rect.width || 54) / ball, .12, .9)
        } : { x: 0, y: 0, s: 1 };
        const from = rect ? { x: 0, y: 0, s: 1 } : to;
        const invert = rect ? to : from;
        const back = rect ? from : to;
        if (reduced() || !window.gsap) {
            stage.style.transform = 'translate(' + back.x + 'px,' + back.y + 'px) scale(' + back.s + ')';
            stage.style.opacity = rect ? '1' : '0';
            if (done) done();
            return;
        }
        window.gsap.fromTo(stage, {
            x: invert.x, y: invert.y, scale: invert.s, opacity: rect ? 0 : 1
        }, {
            x: back.x, y: back.y, scale: back.s, opacity: rect ? 1 : 0,
            duration: .46, ease: rect ? 'back.out(1.5)' : 'power3.in', onComplete: done
        });
    }

    function release() {
        destroyed = true;
        cancelAnimationFrame(frame);
        frame = 0;
        if (gl) {
            gl.deleteBuffer(buffer);
            gl.deleteTexture(faceTex);
            gl.deleteTexture(reliefTex);
            gl.deleteProgram(program);
            const lose = gl.getExtension('WEBGL_lose_context');
            if (lose) lose.loseContext();
        }
        buffer = faceTex = reliefTex = program = gl = null;
        document.removeEventListener('keydown', onKey);
        if (overlay) overlay.remove();
        overlay = stage = glCanvas = shadowCanvas = null;
        current = null;
    }

    function ensureGeometry() {
        if (!geo) geo = buildGeometry();
        return geo;
    }

    function hitPaper(e) {
        if (!stage) return false;
        const r = stage.getBoundingClientRect();
        if (!r.width || !r.height) return true;
        const p = clamp(state.p, 0, 1);
        const lx = (e.clientX - r.left) * view.w / r.width;
        const ly = (e.clientY - r.top) * view.h / r.height;
        // 揉着时纸团是个小球，摊开后是整张纸，命中范围跟着 p 一起长大
        const hw = (BALL.x + (SHEET.w / 2 - BALL.x) * p) * view.k + 16;
        const hh = (BALL.y + (SHEET.h / 2 - BALL.y) * p) * view.k + 16;
        return Math.abs(lx - view.w / 2) <= hw && Math.abs(ly - view.h / 2) <= hh;
    }

    function open(opts) {
        const o = opts || {};
        if (overlay) close({ immediate: true });
        ensureGeometry();
        current = { text: String(o.text || ''), style: STYLES[o.style] ? o.style : 'note', font: String(o.font || '') };
        anchor = o.anchorRect || null;
        onToggle = typeof o.onToggle === 'function' ? o.onToggle : null;
        paintFace(current.style, current.text, current.font);

        destroyed = false;
        overlay = document.createElement('div');
        overlay.id = 'crumple-paper-overlay';
        overlay.innerHTML = '<div class="cp-stage">' +
            '<canvas class="cp-shadow" aria-hidden="true"></canvas>' +
            '<canvas class="cp-gl" aria-hidden="true"></canvas>' +
            '</div>';
        document.body.appendChild(overlay);
        stage = overlay.querySelector('.cp-stage');
        shadowCanvas = overlay.querySelector('.cp-shadow');
        glCanvas = overlay.querySelector('.cp-gl');

        gl = glCanvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
        if (gl) {
            try {
                gl.getExtension('OES_standard_derivatives');
                const vs = shader(gl.VERTEX_SHADER, VS), fs = shader(gl.FRAGMENT_SHADER, FS);
                program = gl.createProgram();
                gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
                gl.deleteShader(vs); gl.deleteShader(fs);
                if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
                uniforms = {};
                ['progress', 'pass', 'size', 'center', 'scale', 'texture', 'relief'].forEach((n) => { uniforms[n] = gl.getUniformLocation(program, 'u_' + n); });
                attribs = {};
                ['closed', 'flat', 'uv'].forEach((n) => { attribs[n] = gl.getAttribLocation(program, 'a_' + n); });
                buffer = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
                gl.bufferData(gl.ARRAY_BUFFER, geo.data, gl.STATIC_DRAW);
                faceTex = uploadTexture(face);
                reliefTex = uploadTexture(geo.relief.canvas);
                gl.enable(gl.DEPTH_TEST);
                gl.depthFunc(gl.LEQUAL);
                gl.frontFace(gl.CW);
            } catch (err) {
                console.warn('[CrumplePaper] WebGL 初始化失败，改用平面降级：', err);
                gl = null;
            }
        }

        measure();
        state = { p: 0, v: 0, target: 0 };
        draw();
        flipTo(anchor);
        overlay.addEventListener('click', (e) => {
            // 点在纸上：摊开/揉回去；点在纸外的空白：直接收起回聊天
            if (hitPaper(e)) setTarget(state.target ? 0 : 1);
            else close();
        });
        document.addEventListener('keydown', onKey);
        window.addEventListener('resize', onResize);
        if (!gl) wake();
        return true;
    }

    function onResize() {
        if (!overlay) return;
        measure();
        draw();
    }

    function onKey(e) { if (e.key === 'Escape') close(); }

    function close(opts) {
        const o = opts || {};
        if (!overlay) return;
        window.removeEventListener('resize', onResize);
        const done = () => { if (overlay) release(); };
        if (o.immediate || !anchor) { done(); return; }
        // 不重置 p：让它一边飞回气泡一边真的被揉回去
        setTarget(0);
        flipTo(anchor, done);
        window.setTimeout(done, 900);
    }

    window.CrumplePaper = {
        styles: STYLES,
        open,
        close,
        toggle: () => setTarget(state && state.target ? 0 : 1),
        isOpen: () => Boolean(overlay),
        prepare: ensureGeometry,
        paintFace
    };
})();
