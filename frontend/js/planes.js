const API_BASE = window.location.origin;

function cerrarSesion() {
    localStorage.clear(); sessionStorage.clear();
    window.location.href = "index.html";
}

function obtenerUsuarioId() {
    const usuario_id = (localStorage.getItem("usuario_id") || sessionStorage.getItem("usuario_id"));

    if (!usuario_id || usuario_id === "undefined" || usuario_id === "null") {
        localStorage.removeItem("usuario_id");
        return null;
    }

    return usuario_id;
}

function escapeHTML(texto) {
    return String(texto || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
async function cargarPlanes() {
    const contenedor = document.getElementById("planesContainer");

    if (!contenedor) return;

    try {
        const respuesta = await fetch(`${API_BASE}/planes`);
        const planes = await respuesta.json();

        contenedor.innerHTML = "";

        if (!planes || planes.length === 0) {
            contenedor.innerHTML = `
                <div class="empty-state">
                    No hay planes registrados en la base de datos.
                </div>
            `;
            return;
        }

        contenedor.innerHTML = planes.map(plan => {
            const id = plan.id || plan.id_plan || plan.plan_id;
            const nombre = plan.nombre || plan.nombre_plan || "Plan";
            const precio = plan.precio || 0;
            const descripcion = plan.descripcion || "Acceso al catálogo StarView.";
            const pantallas = plan.pantallas || 1;

            return `
                <article class="plan-card">
                    <h2>${escapeHTML(nombre)}</h2>

                    <h3>S/ ${Number(precio).toFixed(2)}</h3>

                    <p>${escapeHTML(descripcion)}</p>

                    <p>
                        <strong>Pantallas:</strong> ${escapeHTML(pantallas)}
                    </p>

                    <button 
                        class="btn btn-primary" 
                        onclick="seleccionarPlan('${id}', '${escapeHTML(nombre)}', '${precio}')">
                        Seleccionar plan
                    </button>
                </article>
            `;
        }).join("");

    } catch (error) {
        console.log(error);

        contenedor.innerHTML = `
            <div class="empty-state">
                No se pudo cargar los planes.
            </div>
        `;
    }
}

function seleccionarPlan(id, nombre, precio) {
    localStorage.setItem("plan_id", id);
    localStorage.setItem("plan_nombre", nombre);
    localStorage.setItem("plan_precio", precio);

    const usuario_id = obtenerUsuarioId();

    if (!usuario_id) {
        localStorage.setItem("volver_despues_login", "pago.html");
        window.location.href = "login.html";
        return;
    }

    window.location.href = "pago.html";
}

document.addEventListener("DOMContentLoaded", cargarPlanes);
// ==========================================
// HEARTBEAT DE SEGURIDAD (CIERRE GLOBAL)
// ==========================================
(function iniciarHeartbeatGlobal() {
    setInterval(async () => {
        const usuario_id = localStorage.getItem("usuario_id") || sessionStorage.getItem("usuario_id");
        if (!usuario_id) return;
        try {
            const respuesta = await fetch(window.location.origin + "/api/usuario/ping", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    usuario_id: usuario_id,
                    sesion_version: localStorage.getItem("sesion_version") || sessionStorage.getItem("sesion_version") || 1
                })
            });
            const datos = await respuesta.json();
            if (datos.sesionCerrada) {
                localStorage.clear();
                sessionStorage.clear();
                window.location.replace("login.html");
            }
        } catch (error) {}
    }, 15000);
})();
