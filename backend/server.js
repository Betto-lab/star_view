const express = require("express");
const cors = require("cors");
const axios = require("axios");
const bcrypt = require("bcrypt");
const path = require("path");



require("dotenv").config();



const conexion = require("./db");

const { MercadoPagoConfig, Preference } = require("mercadopago");

const clienteMP = process.env.MP_ACCESS_TOKEN
    ? new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN })
    : null;

const TMDB_API_KEY = "14848f0a935d7e54d7c8ced042603214";    
const app = express();

const registrosPendientes = new Map();
const recuperacionesPerfil = new Map();


function validarFormatoCorreo(correo) {
    const expresion = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return expresion.test(correo);
}

function validarSoloLetras(texto) {
    const expresion = /^[A-Za-záéíóúÁÉÍÓÚñÑ\s]+$/;
    return expresion.test(texto);
}

function validarPasswordSegura(password) {
    const tieneLongitud = password.length >= 8;
    const tieneNumero = /\d/.test(password);
    const tieneSimbolo = /[!@#$%^&*(),.?":{}|<>_\-+=/\\[\];'`~]/.test(password);

    return tieneLongitud && tieneNumero && tieneSimbolo;
}

function generarCodigoVerificacion() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function enviarCorreoVerificacion(correo, nombre, codigo, tipo = "registro") {
    // Pega aquí la URL que te acaba de dar Google Apps Script
    const urlGoogleScript = "https://script.google.com/macros/s/AKfycbwoBuUvkjHGh0LWHiOJvZfg9HtkalQQNYeRLefQVPVYSXzoOxY_jzRGn342e-ox3NWO/exec";

    try {
        console.log(`[CORREO] Intentando enviar código ${codigo} a: ${correo} (Modo: ${tipo})`);
        
        // Usamos fetch nativo que es más compatible con las redirecciones de Google Apps Script
        const respuesta = await fetch(urlGoogleScript, {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({ correo, nombre, codigo, tipo }),
            redirect: "follow"
        });

        console.log(`[CORREO] Respuesta de Google HTTP: ${respuesta.status}`);
    } catch (error) {
        console.log("[CORREO ERROR] Falló la conexión con Google Script:", error.message);
        throw new Error("Fallo en la API de correos");
    }
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

/* =========================
   REGISTRO Y LOGIN
========================= */
const recuperacionesCuenta = new Map();

// 1. Enviar código para recuperar cuenta principal
app.post("/recuperar-cuenta/iniciar", (req, res) => {
    const { correo } = req.body;
    
    conexion.query("SELECT id, nombre FROM usuarios WHERE correo = ?", [correo], async (error, resultados) => {
        if (error) {
            return res.json({ ok: false, mensaje: "Error del servidor al buscar el correo." });
        }
        
        // AHORA SÍ VALIDA SI EL CORREO EXISTE
        if (resultados.length === 0) {
            return res.json({ ok: false, mensaje: "Este correo no está registrado. Verifica si está bien escrito." });
        }
        
        const codigo = generarCodigoVerificacion();
        recuperacionesCuenta.set(correo, { codigo, creado: Date.now() });

        try {
            // El parámetro extra "cuenta" es para que Google Apps Script sepa qué correo enviar
            await enviarCorreoVerificacion(correo, resultados[0].nombre, codigo, "cuenta");
            res.json({ ok: true, mensaje: "Código enviado exitosamente a tu correo." });
        } catch (e) {
            res.json({ ok: false, mensaje: "El servidor falló al intentar enviar el correo." });
        }
    });
});

// 2. Confirmar código y cambiar la contraseña de la cuenta
app.post("/recuperar-cuenta/confirmar", async (req, res) => {
    const { correo, codigo, nueva_password } = req.body;
    const peticion = recuperacionesCuenta.get(correo);

    if (!peticion || peticion.codigo !== codigo || (Date.now() - peticion.creado > 10 * 60 * 1000)) {
        return res.json({ ok: false, mensaje: "Código inválido o expirado" });
    }

    const passwordHash = await bcrypt.hash(nueva_password, 10);
    conexion.query("UPDATE usuarios SET password = ? WHERE correo = ?", [passwordHash, correo], (error) => {
        if (error) return res.json({ ok: false, mensaje: "Error al actualizar contraseña" });
        recuperacionesCuenta.delete(correo);
        res.json({ ok: true, mensaje: "Contraseña actualizada correctamente" });
    });
});
app.post("/registro", async (req, res) => {
    const { nombre, correo, password } = req.body;

    if (!nombre || !correo || !password) {
        return res.json({
            ok: false,
            mensaje: "Completa todos los campos"
        });
    }

    if (!validarSoloLetras(nombre)) {
        return res.json({
            ok: false,
            mensaje: "El nombre solo puede contener letras y espacios"
        });
    }

    if (!validarFormatoCorreo(correo)) {
        return res.json({
            ok: false,
            mensaje: "El formato del correo no es válido"
        });
    }

    if (!validarPasswordSegura(password)) {
        return res.json({
            ok: false,
            mensaje: "La contraseña debe tener mínimo 8 caracteres, 1 número y 1 símbolo"
        });
    }

    try {
        conexion.query(
            "SELECT id FROM usuarios WHERE correo = ?",
            [correo],
            async (error, resultados) => {
                if (error) {
                    console.log("Error al verificar correo:", error);

                    return res.json({
                        ok: false,
                        mensaje: "Error al verificar el correo"
                    });
                }

                if (resultados.length > 0) {
                    return res.json({
                        ok: false,
                        mensaje: "Este correo ya está registrado"
                    });
                }

                const passwordHash = await bcrypt.hash(password, 10);
                const codigo = generarCodigoVerificacion();

                registrosPendientes.set(correo, {
                    nombre,
                    correo,
                    passwordHash,
                    codigo,
                    creado: Date.now()
                });

                try {
                    await enviarCorreoVerificacion(correo, nombre, codigo, "perfil");

                    res.json({
                        ok: true,
                        mensaje: "Código de verificación enviado a tu correo"
                    });
                } catch (errorCorreo) {
                    console.log("Error al enviar correo de verificación:", errorCorreo);

                    registrosPendientes.delete(correo);

                    res.json({
                        ok: false,
                        mensaje: "No se pudo enviar el correo de verificación. Revisa la configuración del correo remitente."
                    });
                }
            }
        );
    } catch (error) {
        console.log("Error interno en registro:", error);

        res.json({
            ok: false,
            mensaje: "Error interno del servidor"
        });
    }
});

app.post("/registro/verificar", (req, res) => {
    const { correo, codigo } = req.body;

    if (!correo || !codigo) {
        return res.json({
            ok: false,
            mensaje: "Correo y código son obligatorios"
        });
    }

    const registro = registrosPendientes.get(correo);

    if (!registro) {
        return res.json({
            ok: false,
            mensaje: "No existe una solicitud de registro pendiente"
        });
    }

    const tiempoExpirado = Date.now() - registro.creado > 10 * 60 * 1000;

    if (tiempoExpirado) {
        registrosPendientes.delete(correo);

        return res.json({
            ok: false,
            mensaje: "El código expiró. Regístrate nuevamente"
        });
    }

    if (registro.codigo !== codigo) {
        return res.json({
            ok: false,
            mensaje: "El código de verificación es incorrecto"
        });
    }

    conexion.query(
        "SELECT id FROM usuarios WHERE correo = ?",
        [correo],
        (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json({
                    ok: false,
                    mensaje: "Error al verificar usuario"
                });
            }

            if (resultados.length > 0) {
                registrosPendientes.delete(correo);

                return res.json({
                    ok: false,
                    mensaje: "Este correo ya está registrado"
                });
            }

            conexion.query(
                "INSERT INTO usuarios(nombre, correo, password) VALUES (?, ?, ?)",
                [registro.nombre, registro.correo, registro.passwordHash],
                (error, resultado) => {
                    if (error) {
                        console.log(error);
                        return res.json({
                            ok: false,
                            mensaje: "Error al registrar usuario"
                        });
                    }

                    registrosPendientes.delete(correo);

                    res.json({
                        ok: true,
                        mensaje: "Registro exitoso. Cuenta verificada correctamente",
                        usuario: {
                            id: resultado.insertId,
                            nombre: registro.nombre,
                            correo: registro.correo
                        }
                    });
                }
            );
        }
    );
});

app.post("/login", (req, res) => {
    const { correo, password } = req.body;

    if (!correo || !password) {
        return res.json({
            ok: false,
            mensaje: "Ingresa correo y contraseña"
        });
    }

    conexion.query(
        "SELECT * FROM usuarios WHERE correo = ?",
        [correo],
        async (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json({
                    ok: false,
                    mensaje: "Error en el servidor"
                });
            }

            if (resultados.length === 0) {
                return res.json({
                    ok: false,
                    mensaje: "Correo no registrado"
                });
            }

            const usuario = resultados[0];

            let passwordValida = false;

            try {
                passwordValida = await bcrypt.compare(password, usuario.password);
            } catch (error) {
                passwordValida = false;
            }

            if (!passwordValida && password === usuario.password) {
                passwordValida = true;
            }

            if (!passwordValida) {
                return res.json({
                    ok: false,
                    mensaje: "Contraseña incorrecta"
                });
            }

            res.json({
                ok: true,
                mensaje: "Inicio de sesión correcto",
                usuario: {
                    id: usuario.id,
                    nombre: usuario.nombre,
                    correo: usuario.correo
                }
            });
        }
    );
});

/* =========================
   CONTENIDO
========================= */

app.get("/contenido", (req, res) => {
    conexion.query(
        "SELECT * FROM contenido ORDER BY id DESC",
        (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json([]);
            }

            res.json(resultados);
        }
    );
});

app.get("/contenido/perfil/:perfil_id", (req, res) => {
    const perfil_id = req.params.perfil_id;

    if (!perfil_id) {
        return res.json([]);
    }

    conexion.query(
        "SELECT infantil FROM perfiles WHERE id = ?",
        [perfil_id],
        (error, perfiles) => {
            if (error) {
                console.log(error);
                return res.json([]);
            }

            if (perfiles.length === 0) {
                return res.json([]);
            }

            const esInfantil = Number(perfiles[0].infantil) === 1;

            let sql = "SELECT * FROM contenido";
            const parametros = [];

            if (esInfantil) {
                sql += " WHERE infantil = 1";
            }

            sql += " ORDER BY id DESC";

            conexion.query(sql, parametros, (error, resultados) => {
                if (error) {
                    console.log(error);
                    return res.json([]);
                }

                res.json(resultados);
            });
        }
    );
});

app.get("/contenido/:id", (req, res) => {
    const id = req.params.id;

    conexion.query(
        "SELECT * FROM contenido WHERE id = ?",
        [id],
        (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json({});
            }

            if (resultados.length === 0) {
                return res.json({});
            }

            res.json(resultados[0]);
        }
    );
});

/* =========================
   PERFILES
========================= */

app.get("/perfiles/:usuario_id", (req, res) => {
    const usuario_id = req.params.usuario_id;

    conexion.query(
        `SELECT id, usuario_id, nombre, avatar, infantil
         FROM perfiles
         WHERE usuario_id = ?
         ORDER BY id ASC`,
        [usuario_id],
        (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json([]);
            }

            res.json(resultados);
        }
    );
});

app.post("/perfiles", (req, res) => {
    const { usuario_id, nombre, avatar, infantil, password_perfil } = req.body;

    if (!usuario_id || !nombre || !avatar || !password_perfil) {
        return res.json({
            ok: false,
            mensaje: "Completa nombre, avatar y contraseña del perfil"
        });
    }

    if (password_perfil.length < 4) {
        return res.json({
            ok: false,
            mensaje: "La contraseña del perfil debe tener mínimo 4 caracteres"
        });
    }

    conexion.query(
        "SELECT COUNT(*) AS total FROM perfiles WHERE usuario_id = ?",
        [usuario_id],
        async (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json({
                    ok: false,
                    mensaje: "Error al verificar perfiles"
                });
            }

            if (resultados[0].total >= 5) {
                return res.json({
                    ok: false,
                    mensaje: "Solo puedes crear hasta 5 perfiles"
                });
            }

            const passwordHash = await bcrypt.hash(password_perfil, 10);

            conexion.query(
                `INSERT INTO perfiles(usuario_id, nombre, avatar, infantil, password_perfil)
                 VALUES (?, ?, ?, ?, ?)`,
                [usuario_id, nombre, avatar, infantil ? 1 : 0, passwordHash],
                (error) => {
                    if (error) {
                        console.log(error);
                        return res.json({
                            ok: false,
                            mensaje: "No se pudo crear el perfil"
                        });
                    }

                    res.json({
                        ok: true,
                        mensaje: "Perfil creado correctamente"
                    });
                }
            );
        }
    );
});


app.post("/perfiles/verificar", (req, res) => {
    const { usuario_id, perfil_id, password_perfil } = req.body;

    if (!usuario_id || !perfil_id || !password_perfil) {
        return res.json({
            ok: false,
            mensaje: "Ingresa la contraseña del perfil"
        });
    }

    conexion.query(
        `SELECT id, nombre, infantil, password_perfil
         FROM perfiles
         WHERE id = ? AND usuario_id = ?`,
        [perfil_id, usuario_id],
        async (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json({
                    ok: false,
                    mensaje: "Error al verificar perfil"
                });
            }

            if (resultados.length === 0) {
                return res.json({
                    ok: false,
                    mensaje: "Perfil no encontrado"
                });
            }

            const perfil = resultados[0];

            if (!perfil.password_perfil) {
                return res.json({
                    ok: true,
                    mensaje: "Perfil sin contraseña configurada",
                    perfil: {
                        id: perfil.id,
                        nombre: perfil.nombre,
                        infantil: Number(perfil.infantil) === 1 ? 1 : 0
                    }
                });
            }

            const passwordValida = await bcrypt.compare(password_perfil, perfil.password_perfil);

            if (!passwordValida) {
                return res.json({
                    ok: false,
                    mensaje: "Contraseña de perfil incorrecta"
                });
            }

            res.json({
                ok: true,
                mensaje: "Perfil verificado correctamente",
                perfil: {
                    id: perfil.id,
                    nombre: perfil.nombre,
                    infantil: Number(perfil.infantil) === 1 ? 1 : 0
                }
            });
        }
    );
});

app.post("/perfiles/recuperar-iniciar", (req, res) => {
    const { usuario_id, perfil_id } = req.body;

    if (!usuario_id || !perfil_id) {
        return res.json({
            ok: false,
            mensaje: "Datos incompletos para recuperar contraseña"
        });
    }

    conexion.query(
        `SELECT 
            perfiles.id AS perfil_id,
            perfiles.nombre AS perfil_nombre,
            usuarios.nombre AS usuario_nombre,
            usuarios.correo AS usuario_correo
         FROM perfiles
         INNER JOIN usuarios ON perfiles.usuario_id = usuarios.id
         WHERE perfiles.id = ? AND perfiles.usuario_id = ?`,
        [perfil_id, usuario_id],
        async (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json({
                    ok: false,
                    mensaje: "Error al buscar el perfil"
                });
            }

            if (resultados.length === 0) {
                return res.json({
                    ok: false,
                    mensaje: "Perfil no encontrado"
                });
            }

            const datos = resultados[0];
            const codigo = generarCodigoVerificacion();
            const clave = `${usuario_id}:${perfil_id}`;

            recuperacionesPerfil.set(clave, {
                usuario_id,
                perfil_id,
                codigo,
                creado: Date.now()
            });

            try {
                // AQUÍ LE AGREGAMOS EL "perfil" AL FINAL DE LA FUNCIÓN
                await enviarCorreoVerificacion(
                    datos.usuario_correo,
                    datos.usuario_nombre,
                    codigo,
                    "perfil"
                );

                res.json({
                    ok: true,
                    mensaje: "Código enviado al correo del usuario"
                });

            } catch (errorCorreo) {
                console.log("Error al enviar código de recuperación de perfil:", errorCorreo);

                recuperacionesPerfil.delete(clave);

                res.json({
                    ok: false,
                    mensaje: "No se pudo enviar el código de recuperación"
                });
            }
        }
    );
});

app.post("/perfiles/recuperar-confirmar", (req, res) => {
    const { usuario_id, perfil_id, codigo, nueva_password } = req.body;

    if (!usuario_id || !perfil_id || !codigo || !nueva_password) {
        return res.json({
            ok: false,
            mensaje: "Completa código y nueva contraseña"
        });
    }

    if (nueva_password.length < 4) {
        return res.json({
            ok: false,
            mensaje: "La nueva contraseña debe tener mínimo 4 caracteres"
        });
    }

    const clave = `${usuario_id}:${perfil_id}`;
    const recuperacion = recuperacionesPerfil.get(clave);

    if (!recuperacion) {
        return res.json({
            ok: false,
            mensaje: "No existe una solicitud de recuperación pendiente"
        });
    }

    const tiempoExpirado = Date.now() - recuperacion.creado > 10 * 60 * 1000;

    if (tiempoExpirado) {
        recuperacionesPerfil.delete(clave);

        return res.json({
            ok: false,
            mensaje: "El código expiró. Solicita uno nuevo"
        });
    }

    if (recuperacion.codigo !== codigo) {
        return res.json({
            ok: false,
            mensaje: "El código ingresado es incorrecto"
        });
    }

    bcrypt.hash(nueva_password, 10, (errorHash, passwordHash) => {
        if (errorHash) {
            console.log(errorHash);
            return res.json({
                ok: false,
                mensaje: "Error al proteger la nueva contraseña"
            });
        }

        conexion.query(
            `UPDATE perfiles
             SET password_perfil = ?
             WHERE id = ? AND usuario_id = ?`,
            [passwordHash, perfil_id, usuario_id],
            (error) => {
                if (error) {
                    console.log(error);
                    return res.json({
                        ok: false,
                        mensaje: "No se pudo actualizar la contraseña del perfil"
                    });
                }

                recuperacionesPerfil.delete(clave);

                res.json({
                    ok: true,
                    mensaje: "Contraseña del perfil actualizada correctamente"
                });
            }
        );
    });
});

/* =========================
   MI LISTA
========================= */

app.post("/mi-lista", (req, res) => {
    const { perfil_id, contenido_id } = req.body;

    if (!perfil_id || !contenido_id) {
        return res.json({
            ok: false,
            mensaje: "Datos incompletos para Mi Lista"
        });
    }

    conexion.query(
        "SELECT * FROM mi_lista WHERE perfil_id = ? AND contenido_id = ?",
        [perfil_id, contenido_id],
        (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json({
                    ok: false,
                    mensaje: "Error al verificar Mi Lista"
                });
            }

            if (resultados.length > 0) {
                return res.json({
                    ok: true,
                    mensaje: "Este contenido ya está en Mi Lista"
                });
            }

            conexion.query(
                "INSERT INTO mi_lista(perfil_id, contenido_id) VALUES (?, ?)",
                [perfil_id, contenido_id],
                (error) => {
                    if (error) {
                        console.log(error);
                        return res.json({
                            ok: false,
                            mensaje: "No se pudo agregar a Mi Lista"
                        });
                    }

                    res.json({
                        ok: true,
                        mensaje: "Agregado a Mi Lista"
                    });
                }
            );
        }
    );
});

app.get("/mi-lista/:perfil_id", (req, res) => {
    const perfil_id = req.params.perfil_id;

    conexion.query(
        `SELECT contenido.*
         FROM mi_lista
         INNER JOIN contenido ON mi_lista.contenido_id = contenido.id
         WHERE mi_lista.perfil_id = ?
         ORDER BY mi_lista.id DESC`,
        [perfil_id],
        (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json([]);
            }

            res.json(resultados);
        }
    );
});

app.delete("/mi-lista/:perfil_id/:contenido_id", (req, res) => {
    const { perfil_id, contenido_id } = req.params;

    conexion.query(
        "DELETE FROM mi_lista WHERE perfil_id = ? AND contenido_id = ?",
        [perfil_id, contenido_id],
        (error) => {
            if (error) {
                console.log(error);
                return res.json({
                    ok: false,
                    mensaje: "No se pudo eliminar"
                });
            }

            res.json({
                ok: true,
                mensaje: "Eliminado de Mi Lista"
            });
        }
    );
});

/* =========================
   HISTORIAL / CONTINUAR VIENDO
========================= */

app.post("/historial", (req, res) => {
    const { perfil_id, contenido_id } = req.body;

    if (!perfil_id || !contenido_id) {
        return res.json({
            ok: false,
            mensaje: "Datos incompletos para historial"
        });
    }

    conexion.query(
        "SELECT id FROM historial WHERE perfil_id = ? AND contenido_id = ? AND terminado = 0 LIMIT 1",
        [perfil_id, contenido_id],
        (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json({
                    ok: false,
                    mensaje: "Error al consultar historial"
                });
            }

            if (resultados.length > 0) {
                return res.json({
                    ok: true,
                    mensaje: "Historial ya existe"
                });
            }

            conexion.query(
                `INSERT INTO historial
                 (perfil_id, contenido_id, minuto_actual, porcentaje, terminado)
                 VALUES (?, ?, 0, 0, 0)`,
                [perfil_id, contenido_id],
                (error) => {
                    if (error) {
                        console.log(error);
                        return res.json({
                            ok: false,
                            mensaje: "Error al registrar historial"
                        });
                    }

                    res.json({
                        ok: true,
                        mensaje: "Historial registrado"
                    });
                }
            );
        }
    );
});

app.get("/continuar/:perfil_id", (req, res) => {
    const perfil_id = req.params.perfil_id;

    conexion.query(
        `SELECT 
            contenido.*,
            historial.minuto_actual,
            historial.porcentaje
         FROM historial
         INNER JOIN contenido ON historial.contenido_id = contenido.id
         WHERE historial.perfil_id = ?
         AND historial.terminado = 0
         ORDER BY historial.id DESC`,
        [perfil_id],
        (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json([]);
            }

            res.json(resultados);
        }
    );
});

app.put("/historial/visto/:id", (req, res) => {
    const contenido_id = req.params.id;
    const { perfil_id } = req.body;

    let sql = `UPDATE historial
               SET terminado = 1, porcentaje = 100
               WHERE contenido_id = ?`;
    const parametros = [contenido_id];

    if (perfil_id) {
        sql += " AND perfil_id = ?";
        parametros.push(perfil_id);
    }

    conexion.query(sql, parametros, (error) => {
        if (error) {
            console.log(error);
            return res.json({
                ok: false,
                mensaje: "Error al marcar como visto"
            });
        }

        res.json({
            ok: true,
            mensaje: "Contenido marcado como visto"
        });
    });
});

app.put("/historial/progreso", (req, res) => {
    const { perfil_id, contenido_id, minuto_actual, porcentaje } = req.body;

    if (!perfil_id || !contenido_id) {
        return res.json({
            ok: false,
            mensaje: "Contenido o perfil no válido"
        });
    }

    conexion.query(
        `UPDATE historial
         SET minuto_actual = ?, porcentaje = ?
         WHERE perfil_id = ?
         AND contenido_id = ?
         AND terminado = 0`,
        [
            minuto_actual || 0,
            porcentaje || 0,
            perfil_id,
            contenido_id
        ],
        (error) => {
            if (error) {
                console.log(error);
                return res.json({
                    ok: false,
                    mensaje: "Error al actualizar progreso"
                });
            }

            res.json({
                ok: true,
                mensaje: "Progreso actualizado"
            });
        }
    );
});

/* =========================
   TMDb
========================= */

app.get("/tmdb/populares", async (req, res) => {
    try {
        const respuesta = await axios.get(
            "https://api.themoviedb.org/3/movie/popular",
            {
                params: {
                    api_key: TMDB_API_KEY,
                    language: "es-ES",
                    page: 1
                }
            }
        );

        const peliculas = respuesta.data.results.map((pelicula) => ({
            tmdb_id: pelicula.id,
            titulo: pelicula.title,
            descripcion: pelicula.overview,
            imagen: pelicula.poster_path
                ? `https://image.tmdb.org/t/p/w500${pelicula.poster_path}`
                : "",
            fondo: pelicula.backdrop_path
                ? `https://image.tmdb.org/t/p/original${pelicula.backdrop_path}`
                : "",
            fecha_estreno: pelicula.release_date || null,
            calificacion: pelicula.vote_average || 0,
            tipo: "pelicula",
            genero: "TMDb",
            origen: "tmdb"
        }));

        res.json(peliculas);
    } catch (error) {
        console.log("Error al obtener populares de TMDb:", error.message);
        res.json([]);
    }
});

app.get("/tmdb/sincronizar", async (req, res) => {
    try {
        let totalInsertados = 0;
        let totalActualizados = 0;
        let totalErrores = 0;

        const paginas = [1, 2];

        for (const pagina of paginas) {
            const respuesta = await axios.get(
                "https://api.themoviedb.org/3/movie/popular",
                {
                    params: {
                        api_key: TMDB_API_KEY,
                        language: "es-ES",
                        page: pagina
                    }
                }
            );

            const peliculas = respuesta.data.results || [];

            for (const pelicula of peliculas) {
                try {
                    const detalle = await axios.get(
                        `https://api.themoviedb.org/3/movie/${pelicula.id}`,
                        {
                            params: {
                                api_key: TMDB_API_KEY,
                                language: "es-ES"
                            }
                        }
                    );

                    const p = detalle.data;

                    const genero = p.genres && p.genres.length > 0
                        ? p.genres.map(g => g.name).join(", ")
                        : "Sin género";

                    const imagen = p.poster_path
                        ? `https://image.tmdb.org/t/p/w500${p.poster_path}`
                        : "";

                    const fondo = p.backdrop_path
                        ? `https://image.tmdb.org/t/p/original${p.backdrop_path}`
                        : "";

                    const generoMinuscula = genero.toLowerCase();

                    const esInfantil =
                        generoMinuscula.includes("familia") ||
                        generoMinuscula.includes("animación") ||
                        generoMinuscula.includes("animacion");

                    await new Promise((resolve) => {
                        conexion.query(
                            `INSERT INTO contenido
                             (titulo, tipo, genero, descripcion, imagen, fondo, tmdb_id, fecha_estreno, calificacion, origen, infantil)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                             ON DUPLICATE KEY UPDATE
                                titulo = VALUES(titulo),
                                tipo = VALUES(tipo),
                                genero = VALUES(genero),
                                descripcion = VALUES(descripcion),
                                imagen = VALUES(imagen),
                                fondo = VALUES(fondo),
                                fecha_estreno = VALUES(fecha_estreno),
                                calificacion = VALUES(calificacion),
                                origen = VALUES(origen),
                                infantil = VALUES(infantil)`,
                            [
                                p.title,
                                "pelicula",
                                genero,
                                p.overview || "Sin descripción disponible.",
                                imagen,
                                fondo,
                                p.id,
                                p.release_date || null,
                                p.vote_average || 0,
                                "tmdb",
                                esInfantil ? 1 : 0
                            ],
                            (error, resultado) => {
                                if (error) {
                                    console.log("Error al sincronizar película:", error);
                                    totalErrores++;
                                    return resolve();
                                }

                                if (resultado.affectedRows === 1) {
                                    totalInsertados++;
                                } else {
                                    totalActualizados++;
                                }

                                resolve();
                            }
                        );
                    });

                } catch (errorPelicula) {
                    console.log("Error al obtener detalle de película:", errorPelicula.message);
                    totalErrores++;
                }
            }
        }

        res.json({
            ok: true,
            mensaje: "Sincronización con TMDb completada",
            insertados: totalInsertados,
            actualizados: totalActualizados,
            errores: totalErrores
        });

    } catch (error) {
        console.log("Error general al sincronizar TMDb:", error.message);

        res.json({
            ok: false,
            mensaje: "No se pudo sincronizar con TMDb",
            error: error.message
        });
    }
});

app.post("/tmdb/importar", async (req, res) => {
    const { tmdb_id } = req.body;

    if (!tmdb_id) {
        return res.json({
            error: true,
            mensaje: "tmdb_id no válido"
        });
    }

    conexion.query(
        "SELECT * FROM contenido WHERE tmdb_id = ?",
        [tmdb_id],
        async (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json({
                    error: true,
                    mensaje: "Error al buscar contenido en MariaDB"
                });
            }

            if (resultados.length > 0) {
                return res.json(resultados[0]);
            }

            try {
                const respuesta = await axios.get(
                    `https://api.themoviedb.org/3/movie/${tmdb_id}`,
                    {
                        params: {
                            api_key: TMDB_API_KEY,
                            language: "es-ES"
                        }
                    }
                );

                const p = respuesta.data;
                const genero = p.genres ? p.genres.map(g => g.name).join(", ") : "Sin género";
                const imagen = p.poster_path ? `https://image.tmdb.org/t/p/w500${p.poster_path}` : "";
                const fondo = p.backdrop_path ? `https://image.tmdb.org/t/p/original${p.backdrop_path}` : "";

                conexion.query(
                    `INSERT INTO contenido
                     (titulo, tipo, genero, descripcion, imagen, fondo, tmdb_id, fecha_estreno, calificacion, origen)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        p.title,
                        "pelicula",
                        genero,
                        p.overview || "Sin descripción disponible.",
                        imagen,
                        fondo,
                        p.id,
                        p.release_date || null,
                        p.vote_average || 0,
                        "tmdb"
                    ],
                    (error, resultado) => {
                        if (error) {
                            console.log(error);
                            return res.json({
                                error: true,
                                mensaje: "Error al guardar contenido de TMDb"
                            });
                        }

                        res.json({
                            id: resultado.insertId,
                            titulo: p.title,
                            tipo: "pelicula",
                            genero,
                            descripcion: p.overview || "Sin descripción disponible.",
                            imagen,
                            fondo,
                            tmdb_id: p.id,
                            fecha_estreno: p.release_date || null,
                            calificacion: p.vote_average || 0,
                            origen: "tmdb"
                        });
                    }
                );
            } catch (error) {
                console.log("Error al consultar TMDb:", error.message);
                res.json({
                    error: true,
                    mensaje: "No se pudo obtener la película desde TMDb"
                });
            }
        }
    );
});

/* =========================
   PLANES, PAGO, FACTURACIÓN
========================= */

app.get("/planes", (req, res) => {
    conexion.query(
        "SELECT * FROM planes ORDER BY precio ASC",
        (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json([]);
            }

            res.json(resultados);
        }
    );
});

app.post("/pagos", (req, res) => {
    const { usuario_id, plan_id, metodo_pago, monto } = req.body;

    if (!usuario_id || !plan_id || !metodo_pago || !monto) {
        return res.json({
            ok: false,
            mensaje: "Datos incompletos para procesar el pago"
        });
    }

    conexion.query(
        `INSERT INTO pagos(usuario_id, plan_id, metodo_pago, monto, estado)
         VALUES (?, ?, ?, ?, 'pagado')`,
        [usuario_id, plan_id, metodo_pago, monto],
        (error) => {
            if (error) {
                console.log(error);
                return res.json({
                    ok: false,
                    mensaje: "Error al registrar el pago"
                });
            }

            conexion.query(
                `INSERT INTO suscripciones(usuario_id, plan_id, estado)
                 VALUES (?, ?, 'activa')`,
                [usuario_id, plan_id],
                (error) => {
                    if (error) {
                        console.log(error);
                        return res.json({
                            ok: false,
                            mensaje: "Pago registrado, pero no se pudo activar la suscripción"
                        });
                    }

                    res.json({
                        ok: true,
                        mensaje: "Pago registrado y suscripción activada"
                    });
                }
            );
        }
    );
});

app.get("/facturacion/:usuario_id", (req, res) => {
    const usuario_id = req.params.usuario_id;

    conexion.query(
        `SELECT p.*, pl.nombre AS plan_nombre
         FROM pagos p
         INNER JOIN planes pl ON p.plan_id = pl.id
         WHERE p.usuario_id = ?
         ORDER BY p.fecha_pago DESC`,
        [usuario_id],
        (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json([]);
            }

            res.json(resultados);
        }
    );
});

app.get("/recibo/:id", (req, res) => {
    const id = req.params.id;

    conexion.query(
        `SELECT
            pagos.id,
            pagos.monto,
            pagos.metodo_pago,
            pagos.estado,
            pagos.fecha_pago,
            planes.nombre AS plan,
            usuarios.nombre AS usuario,
            usuarios.correo
         FROM pagos
         INNER JOIN planes ON pagos.plan_id = planes.id
         INNER JOIN usuarios ON pagos.usuario_id = usuarios.id
         WHERE pagos.id = ?`,
        [id],
        (error, resultados) => {
            if (error || resultados.length === 0) {
                return res.send("Recibo no encontrado");
            }

            const pago = resultados[0];

            res.send(`
                <!DOCTYPE html>
                <html lang="es">
                <head>
                    <meta charset="UTF-8">
                    <title>Recibo StarView</title>
                    <style>
                        body{
                            margin:0;
                            min-height:100vh;
                            font-family: Arial, sans-serif;
                            background:#090b13;
                            color:#f5f5f5;
                            display:flex;
                            align-items:center;
                            justify-content:center;
                            padding:40px;
                        }
                        .recibo{
                            width:100%;
                            max-width:680px;
                            background:linear-gradient(145deg,#111827,#0f1016);
                            border:1px solid rgba(255,255,255,.12);
                            border-radius:22px;
                            padding:34px;
                            box-shadow:0 25px 80px rgba(0,0,0,.45);
                        }
                        h1{
                            color:#e50914;
                            margin:0;
                            letter-spacing:2px;
                        }
                        h2{
                            margin-top:8px;
                            color:#fff;
                        }
                        .fila{
                            padding:12px 0;
                            border-bottom:1px solid rgba(255,255,255,.08);
                        }
                        button{
                            margin-top:24px;
                            padding:13px 22px;
                            background:#e50914;
                            color:white;
                            border:none;
                            border-radius:999px;
                            cursor:pointer;
                            font-weight:bold;
                        }
                    </style>
                </head>
                <body>
                    <div class="recibo">
                        <h1>STARVIEW</h1>
                        <h2>Recibo de pago</h2>

                        <div class="fila"><strong>N° Recibo:</strong> ${pago.id}</div>
                        <div class="fila"><strong>Usuario:</strong> ${pago.usuario}</div>
                        <div class="fila"><strong>Correo:</strong> ${pago.correo}</div>
                        <div class="fila"><strong>Plan:</strong> ${pago.plan}</div>
                        <div class="fila"><strong>Monto:</strong> S/ ${pago.monto}</div>
                        <div class="fila"><strong>Método:</strong> ${pago.metodo_pago}</div>
                        <div class="fila"><strong>Estado:</strong> ${pago.estado}</div>
                        <div class="fila"><strong>Fecha:</strong> ${new Date(pago.fecha_pago).toLocaleString()}</div>

                        <button onclick="window.print()">Descargar / imprimir PDF</button>
                    </div>
                </body>
                </html>
            `);
        }
    );
});

app.get("/suscripcion/:usuario_id", (req, res) => {
    const usuario_id = req.params.usuario_id;

    conexion.query(
        `SELECT
            suscripciones.id,
            suscripciones.estado,
            suscripciones.fecha_inicio,
            suscripciones.fecha_cancelacion,
            suscripciones.renovacion_automatica,
            suscripciones.motivo_cancelacion,
            suscripciones.fecha_fin,
            planes.nombre AS plan,
            planes.precio
         FROM suscripciones
         INNER JOIN planes ON suscripciones.plan_id = planes.id
         WHERE suscripciones.usuario_id = ?
         ORDER BY suscripciones.id DESC
         LIMIT 1`,
        [usuario_id],
        (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json({});
            }

            if (resultados.length === 0) {
                return res.json({});
            }

            res.json(resultados[0]);
        }
    );
});

app.put("/suscripcion/cancelar/:id", (req, res) => {
    const id = req.params.id;
    const { motivo_cancelacion } = req.body;

    if (!motivo_cancelacion) {
        return res.json({
            ok: false,
            mensaje: "Debe ingresar un motivo de cancelación"
        });
    }

    const fechaFin = new Date();
    fechaFin.setMonth(fechaFin.getMonth() + 1);
    const fechaFinSQL = fechaFin.toISOString().split("T")[0];

    conexion.query(
        `UPDATE suscripciones
         SET estado = 'cancelada',
             renovacion_automatica = 0,
             motivo_cancelacion = ?,
             fecha_cancelacion = NOW(),
             fecha_fin = ?
         WHERE id = ?`,
        [motivo_cancelacion, fechaFinSQL, id],
        (error) => {
            if (error) {
                console.log(error);
                return res.json({
                    ok: false,
                    mensaje: "No se pudo cancelar la suscripción"
                });
            }

            res.json({
                ok: true,
                mensaje: "Suscripción cancelada. Mantendrás acceso hasta el fin del mes pagado."
            });
        }
    );
});
/* =========================================
   SISTEMA DE RECOMENDACIONES LOCALES (MULTI-GÉNERO)
========================================= */
app.get("/api/recomendaciones/:genero/:id_actual", (req, res) => {
    const { genero, id_actual } = req.params;

    // 1. Separamos los géneros por comas, quitamos espacios extra y los unimos con un "OR" lógico (|)
    const generosArray = genero.split(',').map(g => g.trim());
    const regexPattern = generosArray.join('|');

    // 2. Usamos REGEXP en MariaDB/MySQL para buscar CUALQUIERA de esas palabras
    conexion.query(
        "SELECT * FROM contenido WHERE genero REGEXP ? AND id != ? LIMIT 6",
        [regexPattern, id_actual],
        (error, resultados) => {
            if (error) {
                console.log("Error buscando recomendaciones:", error);
                return res.json([]);
            }
            res.json(resultados);
        }
    );
});
/* =========================
   SERVIDOR
========================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor iniciado en puerto ${PORT}`);
});