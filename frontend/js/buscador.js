/* =========================================
   SISTEMA DE BÚSQUEDA GLOBAL (SUPERPOSICIÓN)
========================================= */
const API_BUSCADOR = window.location.origin;
let catalogoBuscadorGlobal = [];

// 1. Descargar catálogo en segundo plano (Filtrando niños)
async function inicializarCatalogoBuscador() {
    try {
        const respuesta = await fetch(`${API_BUSCADOR}/contenido`);
        let lista = await respuesta.json();
        
        const esNiño = (localStorage.getItem("perfil_infantil") || sessionStorage.getItem("perfil_infantil")) === "1";
        if (esNiño) {
            lista = lista.filter(item => Number(item.infantil) === 1);
        }
        
        catalogoBuscadorGlobal = lista;
    } catch (error) {
        console.log("Error al precargar el catálogo para el buscador", error);
    }
}

// 2. Funciones para abrir y cerrar
function abrirBuscadorFlotante(e) {
    if(e) e.preventDefault(); // Evita que la página recargue al hacer clic
    const overlay = document.getElementById("searchOverlay");
    const input = document.getElementById("searchInputOverlay");
    if (overlay && input) {
        overlay.classList.remove("oculto");
        input.focus();
        document.body.style.overflow = "hidden"; // Congela la página del fondo
    }
}

function cerrarBuscadorFlotante() {
    const overlay = document.getElementById("searchOverlay");
    const input = document.getElementById("searchInputOverlay");
    const resultados = document.getElementById("searchResults");
    if (overlay) {
        overlay.classList.add("oculto");
        document.body.style.overflow = "auto";
        if(input) input.value = "";
        if(resultados) resultados.innerHTML = "";
    }
}

// 3. Crear tarjeta de película individual
function crearTarjetaBuscador(item) {
    let imagen = item.imagen || "backdrop.jpg";
    if (!imagen.startsWith("http") && !imagen.startsWith("img/")) {
        imagen = `img/${imagen}`;
    }
    
    return `
        <article class="card">
            <img src="${imagen}" class="poster" style="cursor:pointer;" onclick="window.location.href='reproductor.html?id=${item.id}'">
            <div class="card-info">
                <h3>${item.titulo || "Sin título"}</h3>
                <p style="font-size: 12px; color: #a3a3a3;">${item.tipo || "Contenido"} · ${item.genero || "Sin género"}</p>
                <div class="card-actions" style="margin-top: 10px;">
                    <button style="width: 100%; padding: 8px; border-radius: 8px; background: #e50914; color: white; border: none; cursor: pointer; font-weight: bold;" 
                            onclick="window.location.href='reproductor.html?id=${item.id}'">
                        ▶ Ver ahora
                    </button>
                </div>
            </div>
        </article>
    `;
}

// 4. Lógica para buscar al escribir
function realizarBusquedaFlotante() {
    const input = document.getElementById("searchInputOverlay");
    const contenedor = document.getElementById("searchResults");
    
    if (!input || !contenedor) return;
    
    const query = input.value.toLowerCase().trim();
    
    if (query.length === 0) {
        contenedor.innerHTML = ""; 
        return;
    }

    const filtrados = catalogoBuscadorGlobal.filter(item => 
        (item.titulo && item.titulo.toLowerCase().includes(query)) || 
        (item.genero && item.genero.toLowerCase().includes(query)) ||
        (item.tipo && item.tipo.toLowerCase().includes(query))
    );

    if (filtrados.length === 0) {
        contenedor.innerHTML = `<div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 40px; color: #fff;">No se encontraron resultados para "${query}"</div>`;
        return;
    }

    contenedor.innerHTML = filtrados.map(item => crearTarjetaBuscador(item)).join("");
}

// 5. CONECTAR LOS BOTONES CUANDO LA PÁGINA CARGUE
document.addEventListener("DOMContentLoaded", () => {
    inicializarCatalogoBuscador();

    const btnSearchIcon = document.querySelector(".btn-search-icon");
    const btnCloseSearch = document.getElementById("closeSearchOverlay");
    const inputOverlay = document.getElementById("searchInputOverlay");

    if (btnSearchIcon) {
        btnSearchIcon.addEventListener("click", abrirBuscadorFlotante);
    }
    if (btnCloseSearch) {
        btnCloseSearch.addEventListener("click", cerrarBuscadorFlotante);
    }
    if (inputOverlay) {
        inputOverlay.addEventListener("input", realizarBusquedaFlotante);
    }
});