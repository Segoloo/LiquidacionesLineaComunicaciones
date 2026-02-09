// Sistema de Liquidaciones - Versión para Técnicos
// Optimizado para móviles y uso desde celulares

class LiquidacionesApp {
    constructor() {
        this.data = null;
        this.technicians = [];
        this.currentTechnician = null;
        this.selectedMonth = null;
        this.selectedRegion = 'all';
        this.META_MENSUAL = 4500000; // Meta mensual de recaudo
        
        // Topes de comisión
        this.COMMISSION_TIERS = [
            { min: 0, max: 1000000, percentage: 0.15, name: '1', color: 'bronze' },
            { min: 1000001, max: 2000000, percentage: 0.08, name: '2', color: 'silver' },
            { min: 2000001, max: 3000000, percentage: 0.05, name: '3', color: 'gold' },
            { min: 3000001, max: Infinity, percentage: 0.03, name: '4', color: 'platinum' }
        ];
        
        this.init();
    }

    calculateCommission(totalRecaudado) {
        // Si no alcanza la meta mínima, comisión es 0
        if (totalRecaudado < this.META_MENSUAL) {
            return {
                commission: 0,
                tier: { name: 'Ninguno', color: 'none', percentage: 0 },
                excedente: 0,
                metCumplida: false
            };
        }

        const excedente = totalRecaudado - this.META_MENSUAL;
        let commission = 0;
        let currentTier = null;

        // Calcular comisión por tramos
        for (const tier of this.COMMISSION_TIERS) {
            if (excedente >= tier.min) {
                const montoEnTier = Math.min(excedente - tier.min, tier.max - tier.min);
                if (montoEnTier > 0) {
                    commission += montoEnTier * tier.percentage;
                    currentTier = tier;
                }
            }
        }

        return {
            commission: Math.round(commission),
            tier: currentTier || this.COMMISSION_TIERS[0],
            excedente: excedente,
            metCumplida: true
        };
    }

    async init() {
        try {
            this.showLoading('Conectando al servidor...');
            await this.loadData();
            this.hideLoading();
            this.setupEventListeners();
            this.renderRegionFilter();
            this.renderMonthFilter();
            this.renderRanking();
        } catch (error) {
            this.handleError(error);
        }
    }

    showLoading(message) {
        const overlay = document.getElementById('loadingOverlay');
        const progress = document.getElementById('loadingProgress');
        if (overlay) overlay.style.display = 'flex';
        if (progress) progress.textContent = message;
    }

    hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            setTimeout(() => {
                overlay.style.display = 'none';
            }, 500);
        }
    }

    async loadData() {
        this.showLoading('Descargando datos...');
        
        try {
            const cachedData = this.getCachedData();
            if (cachedData) {
                console.log('✓ Datos cargados desde caché');
                this.data = cachedData;
                this.technicians = cachedData.tecnicos || [];
                return;
            }

            const response = await fetch('liquidaciones_db.json.gz');
            
            if (!response.ok) {
                throw new Error(`Error ${response.status}: No se pudo cargar el archivo`);
            }

            this.showLoading('Descargando comprimido...');
            
            const reader = response.body.getReader();
            const chunks = [];
            let receivedLength = 0;
            
            while(true) {
                const {done, value} = await reader.read();
                if (done) break;
                
                chunks.push(value);
                receivedLength += value.length;
                
                const mb = (receivedLength / 1024 / 1024).toFixed(1);
                this.showLoading(`Descargando: ${mb} MB (comprimido)`);
            }

            const chunksAll = new Uint8Array(receivedLength);
            let position = 0;
            for(let chunk of chunks) {
                chunksAll.set(chunk, position);
                position += chunk.length;
            }

            this.showLoading('Descomprimiendo...');
            const decompressed = pako.inflate(chunksAll, { to: 'string' });
            
            this.showLoading('Finalizando...');
            this.data = JSON.parse(decompressed);
            this.technicians = this.data.tecnicos || [];


            this.cacheData(this.data);
            console.log(`✓ ${this.technicians.length} técnicos cargados`);
            
        } catch (error) {
            console.error('Error cargando datos:', error);
            throw new Error('No se pudo cargar el archivo de liquidaciones');
        }
    }

    getCachedData() {
        try {
            const cached = localStorage.getItem('liquidaciones_cache');
            const cacheTime = localStorage.getItem('liquidaciones_cache_time');
            
            if (!cached || !cacheTime) return null;
            
            const sixHours = 6 * 60 * 60 * 1000;
            const now = new Date().getTime();
            
            if (now - parseInt(cacheTime) > sixHours) {
                localStorage.removeItem('liquidaciones_cache');
                localStorage.removeItem('liquidaciones_cache_time');
                return null;
            }
            
            return JSON.parse(cached);
        } catch (error) {
            return null;
        }
    }

    cacheData(data) {
        try {
            localStorage.setItem('liquidaciones_cache', JSON.stringify(data));
            localStorage.setItem('liquidaciones_cache_time', new Date().getTime().toString());
        } catch (error) {
            console.warn('Caché no disponible');
        }
    }

    setupEventListeners() {
        const searchInput = document.getElementById('techSearch');
        const suggestionsDiv = document.getElementById('suggestions');

        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            
            if (query.length < 2) {
                suggestionsDiv.classList.add('hidden');
                return;
            }

            this.showSuggestions(query);
        });

        searchInput.addEventListener('focus', () => {
            if (searchInput.value.trim().length >= 2) {
                this.showSuggestions(searchInput.value.trim());
            }
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-box')) {
                suggestionsDiv.classList.add('hidden');
            }
        });

        // Cerrar modal con ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });

        // Cerrar modal al hacer click fuera
        const modal = document.getElementById('techModal');
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal();
            }
        });

        // Actualizar última actualización
        if (this.data && this.data.resumen) {
            const lastUpdate = document.getElementById('lastUpdate');
            if (lastUpdate) {
                lastUpdate.textContent = this.formatDate(this.data.resumen.fecha_generacion);
            }
        }
    }

    showSuggestions(query) {
        const suggestionsDiv = document.getElementById('suggestions');
        const queryLower = query.toLowerCase();

        // Obtener el mes más reciente disponible en los datos
        const availableMonths = this.getRecentMonths();
        const currentMonthStr = availableMonths.length > 0 ? availableMonths[0].value : null;

        if (!currentMonthStr) {
            suggestionsDiv.innerHTML = `
                <div class="suggestion-item">
                    <div class="suggestion-info">
                        <div class="suggestion-name">No hay datos disponibles</div>
                        <div class="suggestion-stats">Intenta más tarde</div>
                    </div>
                </div>
            `;
            suggestionsDiv.classList.remove('hidden');
            return;
        }

        console.log('Buscando mes más reciente:', currentMonthStr); // Debug

        const matches = this.technicians
            .filter(tech => tech.nombre.toLowerCase().includes(queryLower))
            .map(tech => {
                // Buscar el mes más reciente disponible
                const mesData = tech.meses.find(m => m.mes === currentMonthStr);
                
                let tareasCount = 0;
                let netoMesActual = 0;
                
                if (mesData) {
                    netoMesActual = mesData.total_neto || 0;
                    tareasCount = mesData.tareas ? mesData.tareas.length : 0;
                    console.log(`${tech.nombre}: encontró mes ${currentMonthStr} con $${netoMesActual} y ${tareasCount} tareas`); // Debug
                } else {
                    console.log(`${tech.nombre}: NO encontró mes ${currentMonthStr}, mostrando $0`); // Debug
                }
                
                return {
                    ...tech,
                    netoMesActual,
                    tareasCount
                };
            })
            .sort((a, b) => b.netoMesActual - a.netoMesActual)
            .slice(0, 8);

        if (matches.length === 0) {
            suggestionsDiv.innerHTML = `
                <div class="suggestion-item">
                    <div class="suggestion-info">
                        <div class="suggestion-name">No se encontraron resultados</div>
                        <div class="suggestion-stats">Intenta con otro nombre</div>
                    </div>
                </div>
            `;
            suggestionsDiv.classList.remove('hidden');
            return;
        }

        suggestionsDiv.innerHTML = matches.map(tech => `
            <div class="suggestion-item" onclick="app.selectTechnician('${this.escapeHtml(tech.nombre)}')">
                <div class="suggestion-info">
                    <div class="suggestion-name">${this.escapeHtml(tech.nombre)}</div>
                    <div class="suggestion-stats">${tech.tareasCount} tareas este mes</div>
                </div>
                <div class="suggestion-amount">${this.formatCurrency(tech.netoMesActual)}</div>
            </div>
        `).join('');

        suggestionsDiv.classList.remove('hidden');
    }

    selectTechnician(name) {
        const tech = this.technicians.find(t => t.nombre === name);
        
        if (!tech) {
            alert('Técnico no encontrado');
            return;
        }

        this.currentTechnician = tech;
        document.getElementById('suggestions').classList.add('hidden');
        
        this.openModal(tech);
    }

    calculatePercentage(amount) {
        if (!amount || amount === 0) return 0;
        return ((amount / this.META_MENSUAL) * 100).toFixed(1);
    }

    getPercentageColor(percentage) {
        if (percentage >= 100) return '#48bb78'; // Verde - Meta cumplida
        if (percentage >= 80) return '#ed8936'; // Naranja - Cerca de la meta
        return '#f56565'; // Rojo - Lejos de la meta
    }

    getPercentageStatus(percentage) {
        if (percentage >= 100) return '✅ Meta cumplida';
        if (percentage >= 80) return '⚠️ Cerca de la meta';
        return '📊 En progreso';
    }

    openModal(tech) {
        this.currentTechnician = tech; // Guardar referencia del técnico
        const modal = document.getElementById('techModal');
        const detailsDiv = document.getElementById('techDetails');

        const avatar = tech.nombre.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        
        // Obtener el mes actual real (febrero 2026)
        const hoy = new Date();
        // Los meses en los datos están en formato "February 2026", no "2026-02"
        const mesActualString = hoy.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        
        // Buscar específicamente el mes actual en los datos del técnico
        const mesActual = tech.meses.find(m => m.mes === mesActualString);
        
        // Asegurarse de que los valores sean números, no undefined o null
        const netoMesActual = mesActual && typeof mesActual.total_neto === 'number' ? mesActual.total_neto : 0;
        const tareasMesActual = mesActual && typeof mesActual.cantidad_tareas === 'number' ? mesActual.cantidad_tareas : 0;
        
        // Calcular porcentaje del mes actual
        const percentageMesActual = this.calculatePercentage(netoMesActual);
        const percentageColorMesActual = this.getPercentageColor(percentageMesActual);
        const percentageStatusMesActual = this.getPercentageStatus(percentageMesActual);

        detailsDiv.innerHTML = `
            <div class="tech-header">
                <div class="tech-avatar">${avatar}</div>
                <div class="tech-name">${this.escapeHtml(tech.nombre)}</div>
                <div class="tech-total">${this.formatCurrency(netoMesActual)}</div>
            </div>

            <div class="current-month-title">Estadísticas Mes Actual</div>

            <div class="summary-grid">
                <div class="summary-stat">
                    <div class="summary-label">Total Tareas</div>
                    <div class="summary-value">${tareasMesActual}</div>
                </div>
                <div class="summary-stat">
                    <div class="summary-label">NETO RECAUDADO</div>
                    <div class="summary-value">${this.formatCurrency(netoMesActual)}</div>
                </div>
                <div class="summary-stat" style="grid-column: 1 / -1;">
                    <div class="summary-label">META MENSUAL</div>
                    <div class="summary-value" style="color: var(--accent); font-size: 1.5rem;">
                        ${this.formatCurrency(this.META_MENSUAL)}
                    </div>
                </div>
                <div class="summary-stat" style="grid-column: 1 / -1;">
                    <div class="summary-label">% CUMPLIMIENTO</div>
                    <div class="summary-value" style="color: ${percentageColorMesActual}; font-size: 2rem;">
                        ${percentageMesActual}%
                    </div>
                    <div class="percentage-status" style="color: ${percentageColorMesActual}; font-size: 0.875rem; margin-top: 0.5rem;">
                        ${percentageStatusMesActual}
                    </div>
                    <div class="progress-bar-container" style="margin-top: 1rem;">
                        <div class="progress-bar-fill" style="width: ${Math.min(percentageMesActual, 100)}%; background: ${percentageColorMesActual};"></div>
                    </div>
                </div>
            </div>

            ${this.renderCommissionSection(netoMesActual)}

            <div class="current-month-download">
                <div class="current-month-download-title">Descargar Reporte Mes Actual</div>
                <button class="pdf-download-btn" onclick="app.downloadCurrentMonthPDF()">
                    <span class="icon">📄</span>
                    <span>Descargar PDF Mes Actual</span>
                </button>
            </div>

            <div class="months-section">
                <h3 class="months-title">Detalle por Mes</h3>
                ${tech.meses
                    .sort((a, b) => new Date(b.mes) - new Date(a.mes))
                    .map(mes => {
                        const monthName = new Date(mes.mes + '-01').toLocaleDateString('es-CO', { 
                            month: 'long', 
                            year: 'numeric' 
                        });
                        const monthId = 'month-' + mes.mes.replace(/[^a-zA-Z0-9]/g, '');
                        const percentage = this.calculatePercentage(mes.total_neto);
                        const percentageColor = this.getPercentageColor(percentage);
                        const percentageStatus = this.getPercentageStatus(percentage);
                        
                        return `
                            <div class="month-card">
                                <div class="month-card-header" onclick="app.toggleMonth('${monthId}')">
                                    <div class="month-card-info">
                                        <div class="month-card-title">${monthName}</div>
                                        <div class="month-card-subtitle">${mes.cantidad_tareas} tareas</div>
                                    </div>
                                    <div class="month-card-right">
                                        <div class="month-card-amount">${this.formatCurrency(mes.total_neto)}</div>
                                        <span class="expand-icon" id="${monthId}-icon">▼</span>
                                    </div>
                                </div>
                                <div class="month-card-body" id="${monthId}">
                                    <!-- Estadísticas del mes con porcentaje de cumplimiento -->
                                    <div class="month-stats-container">
                                        <div class="month-stats-grid">
                                            <div class="month-stat-card">
                                                <div class="month-stat-label">Meta Mensual</div>
                                                <div class="month-stat-value">${this.formatCurrency(this.META_MENSUAL)}</div>
                                            </div>
                                            <div class="month-stat-card">
                                                <div class="month-stat-label">Recaudado</div>
                                                <div class="month-stat-value">${this.formatCurrency(mes.total_neto)}</div>
                                            </div>
                                        </div>
                                        <div class="month-percentage-card">
                                            <div class="month-stat-label">% Cumplimiento</div>
                                            <div class="month-stat-value" style="color: ${percentageColor}; font-size: 2rem;">
                                                ${percentage}%
                                            </div>
                                            <div class="percentage-status" style="color: ${percentageColor}; font-size: 0.875rem; margin-top: 0.5rem;">
                                                ${percentageStatus}
                                            </div>
                                            <div class="progress-bar-container">
                                                <div class="progress-bar-fill" style="width: ${Math.min(percentage, 100)}%; background: ${percentageColor};"></div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    ${this.renderCommissionSection(mes.total_neto)}
                                    
                                    ${mes.tareas && mes.tareas.length > 0 ? `
                                        <div class="tasks-section">
                                            <div class="tasks-title">Tareas Completadas (${mes.tareas.length})</div>
                                            ${mes.tareas
                                                .sort((a, b) => new Date(b.fecha_cierre || b.fecha_resolucion) - new Date(a.fecha_cierre || a.fecha_resolucion))
                                                .map(tarea => `
                                                    <div class="task-item">
                                                        <div class="task-header">
                                                            <div class="task-type-badge">
                                                                ${this.getTypeIcon(tarea.tipo_origen || tarea.tipo)} ${tarea.tipo_actividad || tarea.tipo_origen || tarea.tipo || 'Tarea'}
                                                            </div>
                                                            <div class="task-id">${tarea.tarea || tarea.numero_tarea}</div>
                                                        </div>
                                                        <div class="task-body">
                                                            <div class="task-info">
                                                                <div class="task-location">📍 ${tarea.nombre_punto || tarea.ciudad || 'Sin ubicación'}</div>
                                                                <div class="task-dept">🗺️ Zona: ${tarea.bodega || 'Sin zona'}</div>
                                                                <div class="task-dept">🏢 ${tarea.departamento || 'Sin departamento'} ${tarea.ciudad ? '- ' + tarea.ciudad : ''}</div>
                                                                ${tarea.tipificacion ? `<div class="task-tipif">🔖 ${tarea.tipificacion}</div>` : ''}
                                                                <div class="task-date">📅 ${this.formatTaskDate(tarea.fecha_cierre || tarea.fecha_resolucion)}</div>
                                                                ${tarea.formulario ? `<div class="task-form">📋 ${tarea.formulario}</div>` : ''}
                                                            </div>
                                                            <div class="task-value">${this.formatCurrency(tarea.valor_neto)}</div>
                                                        </div>
                                                    </div>
                                                `).join('')}
                                        </div>
                                        <button class="pdf-month-btn" onclick="app.downloadMonthPDF('${mes.mes}')">
                                            <span class="icon">📥</span>
                                            <span>Descargar PDF de este mes</span>
                                        </button>
                                    ` : '<p style="text-align: center; color: var(--text-muted); padding: 2rem;">No hay tareas detalladas para este mes</p>'}
                                </div>
                            </div>
                        `;
                    }).join('')}
            </div>
        `;

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    renderCommissionSection(totalRecaudado) {
        const commissionData = this.calculateCommission(totalRecaudado);
        const { commission, tier, excedente, metCumplida } = commissionData;

        return `
            <div class="commission-card">
                <div class="commission-header">
                    <div class="commission-title">
                        <span class="commission-icon">💰</span>
                        COMISIÓN A OBTENER
                    </div>
                    <span class="commission-tier-badge tier-${tier.color}">${tier.name}</span>
                </div>

                <div class="commission-amount-box">
                    <div class="commission-label">Comisión Calculada</div>
                    <div class="commission-value">${this.formatCurrency(commission)}</div>
                    <div class="commission-subtitle">
                        ${metCumplida ? 
                            `Sobre el excedente de ${this.formatCurrency(excedente)}` : 
                            `Meta mínima no alcanzada (${this.formatCurrency(this.META_MENSUAL - totalRecaudado)} faltantes)`
                        }
                    </div>
                </div>

                <div class="commission-details">
                    <div class="commission-detail-row">
                        <div class="commission-detail-label">
                            <span>📊</span> Total Recaudado
                        </div>
                        <div class="commission-detail-value">${this.formatCurrency(totalRecaudado)}</div>
                    </div>
                    <div class="commission-detail-row">
                        <div class="commission-detail-label">
                            <span>🎯</span> Meta Mensual
                        </div>
                        <div class="commission-detail-value">${this.formatCurrency(this.META_MENSUAL)}</div>
                    </div>
                    <div class="commission-detail-row">
                        <div class="commission-detail-label">
                            <span>📈</span> Excedente sobre Meta
                        </div>
                        <div class="commission-detail-value" style="color: ${excedente > 0 ? 'var(--success)' : 'var(--danger)'}">
                            ${this.formatCurrency(excedente)}
                        </div>
                    </div>
                    ${metCumplida ? `
                        <div class="commission-detail-row">
                            <div class="commission-detail-label">
                                <span>💎</span> Nivel Actual
                            </div>
                            <div class="commission-detail-value">
                                ${tier.name} - ${(tier.percentage * 100).toFixed(0)}%
                            </div>
                        </div>
                    ` : ''}
                </div>

                <div class="minimum-badge ${metCumplida ? 'met' : ''}">
                    <span>${metCumplida ? '✓' : '⚠️'}</span>
                    ${metCumplida ? 
                        'Meta mínima alcanzada - Comisión activa' : 
                        `Requiere ${this.formatCurrency(this.META_MENSUAL)} para activar comisiones`
                    }
                </div>

                <div class="commission-tiers-table">
                    <div class="tier-header">📊 TOPES DE COMISIÓN 📊</div>
                    ${this.COMMISSION_TIERS.map((tierItem, index) => {
                        const isActive = metCumplida && tier.name === tierItem.name;
                        const rangeMin = this.formatCurrency(tierItem.min);
                        const rangeMax = tierItem.max === Infinity ? '∞' : this.formatCurrency(tierItem.max);
                        
                        return `
                            <div class="tier-row ${isActive ? 'active' : ''}">
                                <div class="tier-cell">
                                    <div class="tier-cell-label">Nivel</div>
                                    <div class="tier-cell-value">${tierItem.name}</div>
                                </div>
                                <div class="tier-cell">
                                    <div class="tier-cell-label">Rango (Excedente)</div>
                                    <div class="tier-cell-value">${rangeMin} - ${rangeMax}</div>
                                </div>
                                <div class="tier-cell">
                                    <div class="tier-cell-label">Comisión</div>
                                    <div class="tier-cell-value tier-percentage">${(tierItem.percentage * 100).toFixed(0)}%</div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    closeModal() {
        const modal = document.getElementById('techModal');
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    toggleMonth(monthId) {
        const monthBody = document.getElementById(monthId);
        const icon = document.getElementById(monthId + '-icon');
        
        if (!monthBody || !icon) return;

        const isExpanded = monthBody.classList.contains('expanded');
        
        if (isExpanded) {
            monthBody.classList.remove('expanded');
            icon.classList.remove('expanded');
        } else {
            monthBody.classList.add('expanded');
            icon.classList.add('expanded');
        }
    }

    getRecentMonths() {
        const monthsSet = new Set();
        
        this.technicians.forEach(tech => {
            tech.meses.forEach(mes => {
                monthsSet.add(mes.mes);
            });
        });

        const months = Array.from(monthsSet)
            .sort((a, b) => new Date(b) - new Date(a))
            .slice(0, 6);

        return months.map(month => {
            const date = new Date(month + '-01');
            return {
                value: month,
                label: date.toLocaleDateString('es-CO', { 
                    month: 'short', 
                    year: 'numeric' 
                }).replace('.', '')
            };
        });
    }

    renderMonthFilter() {
        const filterDiv = document.getElementById('monthFilter');
        if (!filterDiv) return;

        const months = this.getRecentMonths();
        
        if (months.length === 0) {
            filterDiv.innerHTML = '<p style="color: var(--text-muted);">No hay meses disponibles</p>';
            return;
        }

        if (!this.selectedMonth) {
            this.selectedMonth = months[0].value;
        }

        filterDiv.innerHTML = `
            <div class="filter-group">
                <label class="filter-label">📅 Selecciona el Mes</label>
                <div class="month-filter-container">
                    ${months.map(month => `
                        <button 
                            class="month-btn ${month.value === this.selectedMonth ? 'active' : ''}" 
                            onclick="app.changeMonth('${month.value}')">
                            ${month.label}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
    }

    changeMonth(month) {
        this.selectedMonth = month;
        this.renderMonthFilter();
        this.renderRanking();
    }

    changeMonth(month) {
        this.selectedMonth = month;
        this.renderMonthFilter();
        this.renderRanking();
    }

    renderRanking() {
        const gridDiv = document.getElementById('rankingGrid');
        
        if (!this.selectedMonth) {
            const months = this.getRecentMonths();
            this.selectedMonth = months.length > 0 ? months[0].value : null;
        }

        if (!this.selectedMonth) {
            gridDiv.innerHTML = this.renderEmptyState();
            return;
        }

        let filteredTechs = this.technicians;
        
        // Filtrar por región si no es "all"
        if (this.selectedRegion && this.selectedRegion !== 'all') {
            filteredTechs = this.technicians.filter(tech => {
                const mesData = tech.meses.find(m => m.mes === this.selectedMonth);
                if (!mesData || !mesData.tareas) return false;
                
                return mesData.tareas.some(t => (t.bodega || t.departamento) === this.selectedRegion);
            });
        }

        const ranking = filteredTechs
            .map(tech => {
                const mesData = tech.meses.find(m => m.mes === this.selectedMonth);
                if (!mesData) return null;
                
                return {
                    nombre: tech.nombre,
                    total: mesData.total_neto,
                    tareas: mesData.cantidad_tareas,
                    percentage: this.calculatePercentage(mesData.total_neto)
                };
            })
            .filter(t => t && t.total > 0)
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);

        if (ranking.length === 0) {
            gridDiv.innerHTML = this.renderEmptyState();
            return;
        }

        // Separar top 3 del resto
        const top3 = ranking.slice(0, 3);
        const rest = ranking.slice(3);

        // Generar HTML del podio (orden: 2do, 1ro, 3ro)
        let podiumHTML = '';
        if (top3.length > 0) {
            const podiumOrder = [
                top3[1] || null, // 2do lugar (izquierda)
                top3[0] || null, // 1er lugar (centro)
                top3[2] || null  // 3er lugar (derecha)
            ];

            const classOrder = ['second', 'first', 'third'];
            const rankOrder = [2, 1, 3];

            podiumHTML = `
                <div class="podium-container">
                    ${podiumOrder.map((tech, idx) => {
                        if (!tech) return '';
                        const avatar = tech.nombre.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                        const percentageColor = this.getPercentageColor(tech.percentage);
                        
                        return `
                            <div class="podium-place ${classOrder[idx]}" onclick="app.selectTechnician('${this.escapeHtml(tech.nombre)}')">
                                <div class="podium-medal">
                                    <div class="podium-rank">${rankOrder[idx]}</div>
                                    <div class="podium-avatar">${avatar}</div>
                                </div>
                                <div class="podium-pedestal">
                                    <div class="podium-name" title="${this.escapeHtml(tech.nombre)}">${this.escapeHtml(tech.nombre)}</div>
                                    <div class="podium-tasks">${tech.tareas} tareas</div>
                                    <div class="podium-amount">${this.formatCurrency(tech.total)}</div>
                                    <div class="podium-percentage" style="background-color: ${percentageColor}; color: white;">
                                        ${tech.percentage}%
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }

        // Generar HTML para los rankings del 4-10
        let listHTML = '';
        if (rest.length > 0) {
            listHTML = `
                <div class="ranking-separator">
                    <div class="ranking-separator-text">Top 4 - 10</div>
                </div>
                <div class="ranking-list">
                    ${rest.map((tech, index) => {
                        const position = index + 4; // Empieza en 4
                        const avatar = tech.nombre.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                        
                        return `
                            <div class="ranking-card" onclick="app.selectTechnician('${this.escapeHtml(tech.nombre)}')">
                                <div class="ranking-position">${position}</div>
                                <div class="ranking-info">
                                    <div class="ranking-avatar">${avatar}</div>
                                    <div class="ranking-details">
                                        <div class="ranking-name" title="${this.escapeHtml(tech.nombre)}">${this.escapeHtml(tech.nombre)}</div>
                                        <div class="ranking-tasks">${tech.tareas} tareas</div>
                                    </div>
                                </div>
                                <div class="ranking-stats">
                                    <div class="ranking-amount">${this.formatCurrency(tech.total)}</div>
                                    <div class="ranking-label">${tech.percentage}% cumplimiento</div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }

        gridDiv.innerHTML = podiumHTML + listHTML;
    }

    changeRegion(region) {
        this.selectedRegion = region;
        this.renderRegionFilter();
        this.renderRanking();
    }

    renderRegionFilter() {
        const filterDiv = document.getElementById('regionFilter');
        if (!filterDiv) return;

        const regions = this.getRegions();
        
        filterDiv.innerHTML = `
            <div class="filter-group">
                <label class="filter-label">🗺️ Selecciona tu Zona</label>
                <div class="zone-filter-container">
                    ${regions.map(region => `
                        <button 
                            class="zone-btn ${region.isActive ? 'active' : ''}" 
                            onclick="app.changeRegion('${region.value}')">
                            ${region.label}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
    }

    getRegions() {
        const regionsSet = new Set();
        
        this.technicians.forEach(tech => {
            tech.meses.forEach(mes => {
                if (mes.tareas) {
                    mes.tareas.forEach(tarea => {
                        const region = tarea.bodega || tarea.departamento;
                        if (region && region !== 'SIN ZONA') {
                            regionsSet.add(region);
                        }
                    });
                }
            });
        });

        const regions = Array.from(regionsSet);
        
        // Filtrar solo las 6 zonas macro principales (ignorar zonas pequeñas)
        const zonasMacro = [
            'NOROCCIDENTE',
            'SUROCCIDENTE Y EJE CAFETERO',
            'CUNDINAMARCA',
            'COSTA',
            'SANTANDERES',
            'REMOTAS'
        ];
        
        const regionesFiltradas = regions.filter(r => zonasMacro.includes(r));
        
        // Ordenar según el orden de importancia de las zonas
        regionesFiltradas.sort((a, b) => {
            return zonasMacro.indexOf(a) - zonasMacro.indexOf(b);
        });
        
        return [
            { value: 'all', label: 'Todas las zonas', isActive: !this.selectedRegion || this.selectedRegion === 'all' },
            ...regionesFiltradas.map(r => ({
                value: r,
                label: r,
                isActive: this.selectedRegion === r
            }))
        ];
    }

    renderEmptyState() {
        return `
            <div class="empty-state">
                <div class="empty-icon">📊</div>
                <div class="empty-title">No hay datos disponibles</div>
                <div class="empty-text">No se encontraron liquidaciones para este período</div>
            </div>
        `;
    }

    getTypeIcon(type) {
        const icons = {
            'INCIDENTE': '🔧',
            'ORDEN_CAMBIO': '📝',
            'CIERRE': '🔒',
            'POS': '💳',
            'IMPLEMENTACION': '🚀',
            'VISITA': '👁️',
            'OTRA': '📋'
        };
        return icons[type] || '📋';
    }

    formatCurrency(value) {
        if (!value || isNaN(value)) return '$0';
        const rounded = Math.round(value);
        return '$' + rounded.toLocaleString('es-CO');
    }

    formatDate(dateString) {
        if (!dateString) return 'No disponible';
        
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('es-CO', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch (error) {
            return dateString;
        }
    }

    formatTaskDate(dateString) {
        if (!dateString) return 'No disponible';
        
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('es-CO', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            return dateString;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    downloadCurrentMonthPDF() {
        if (!this.currentTechnician) {
            alert('No hay técnico seleccionado');
            return;
        }

        // Obtener el mes actual real (febrero 2026)
        const hoy = new Date();
        // Los meses en los datos están en formato "February 2026", no "2026-02"
        const mesActualString = hoy.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        
        // Buscar específicamente el mes actual en los datos del técnico
        const mesActual = this.currentTechnician.meses.find(m => m.mes === mesActualString);
        
        if (!mesActual) {
            alert('No hay datos del mes actual disponibles');
            return;
        }

        this.downloadMonthPDF(mesActual.mes);
    }

    downloadMonthPDF(targetMonth) {
        const tech = this.currentTechnician;
        if (!tech) {
            alert('Error: No hay técnico seleccionado');
            return;
        }

        const btn = event.target.closest('button');
        if (!btn) return;

        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<span class="icon">⏳</span><span>Generando PDF...</span>';
        btn.disabled = true;

        try {
            const mesData = tech.meses.find(m => m.mes === targetMonth);
            
            if (!mesData) {
                alert('No hay datos para este mes');
                btn.innerHTML = originalHTML;
                btn.disabled = false;
                return;
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            
            // Colores corporativos
            const primaryColor = [59, 130, 246]; // Azul corporativo
            const secondaryColor = [139, 92, 246]; // Morado
            const textColor = [248, 250, 252]; // Texto claro
            const textMuted = [160, 174, 192]; // Texto muted
            const bgDark = [11, 14, 26]; // Fondo oscuro principal
            const bgCard = [28, 33, 48]; // Fondo de tarjetas
            
            // Función para agregar logo (se intenta cargar desde el HTML)
            let logoDataUrl = null;
            const logoImg = document.querySelector('.logo, .hero-logo-large');
            if (logoImg && logoImg.src && !logoImg.src.includes('data:')) {
                // Intentar cargar el logo
                try {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.src = logoImg.src;
                    // El logo se cargará de forma asíncrona, por ahora continuamos sin él
                } catch(e) {
                    console.log('Logo no disponible para PDF');
                }
            }
            
            // Función helper para aplicar fondo corporativo a una página
            const applyPageBackground = (isFirstPage = false) => {
                // Fondo oscuro principal
                doc.setFillColor(...bgDark);
                doc.rect(0, 0, pageWidth, pageHeight, 'F');
                
                // Header corporativo
                doc.setFillColor(...bgCard);
                doc.rect(0, 0, pageWidth, isFirstPage ? 40 : 25, 'F');
                
                // Borde inferior del header con gradiente simulado
                doc.setDrawColor(...primaryColor);
                doc.setLineWidth(0.5);
                doc.line(0, isFirstPage ? 40 : 25, pageWidth, isFirstPage ? 40 : 25);
                
                if (isFirstPage) {
                    // Header principal de primera página
                    doc.setTextColor(255, 255, 255);
                    doc.setFontSize(24);
                    doc.setFont(undefined, 'bold');
                    doc.text('LINEA COMUNICACIONES', pageWidth / 2, 15, { align: 'center' });
                    doc.setFontSize(14);
                    doc.setFont(undefined, 'normal');
                    doc.text('Reporte de Liquidaciones', pageWidth / 2, 25, { align: 'center' });
                    doc.setFontSize(10);
                    doc.setTextColor(...textMuted);
                    doc.text(`Generado el ${fechaGeneracion}`, pageWidth / 2, 33, { align: 'center' });
                } else {
                    // Header reducido para páginas siguientes
                    doc.setTextColor(...primaryColor);
                    doc.setFontSize(12);
                    doc.setFont(undefined, 'bold');
                    doc.text('LINEA COMUNICACIONES', 15, 10, { align: 'left' });
                    doc.setTextColor(...textMuted);
                    doc.setFontSize(9);
                    doc.setFont(undefined, 'normal');
                    doc.text(`${tech.nombre} - ${monthName}`, 15, 18, { align: 'left' });
                }
            };
            
            const monthName = new Date(targetMonth + '-01').toLocaleDateString('es-CO', {
                month: 'long',
                year: 'numeric'
            });

            const tareasMes = mesData.cantidad_tareas || 0;
            const netoMes = mesData.total_neto || 0;
            const percentageMes = this.calculatePercentage(netoMes);
            
            const fechaGeneracion = new Date().toLocaleDateString('es-CO', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            let yPos = 0;

            // Aplicar fondo de primera página
            applyPageBackground(true);

            yPos = 50;

            // Información del técnico con diseño mejorado
            doc.setFillColor(...bgCard);
            doc.roundedRect(15, yPos, pageWidth - 30, 35, 3, 3, 'F');
            
            // Borde con acento
            doc.setDrawColor(...primaryColor);
            doc.setLineWidth(0.5);
            doc.roundedRect(15, yPos, pageWidth - 30, 35, 3, 3, 'S');
            
            doc.setTextColor(...primaryColor);
            doc.setFontSize(18);
            doc.setFont(undefined, 'bold');
            doc.text(tech.nombre, pageWidth / 2, yPos + 12, { align: 'center' });
            
            doc.setFontSize(11);
            doc.setTextColor(...textColor);
            doc.text(`Periodo: ${monthName}`, pageWidth / 2, yPos + 20, { align: 'center' });
            
            doc.setFontSize(24);
            doc.setTextColor(...primaryColor);
            doc.text(this.formatCurrency(netoMes), pageWidth / 2, yPos + 30, { align: 'center' });

            yPos += 45;

            // Título estadísticas del mes
            doc.setTextColor(...textColor);
            doc.setFontSize(11);
            doc.setFont(undefined, 'bold');
            doc.text(`ESTADÍSTICAS - ${monthName.toUpperCase()}`, pageWidth / 2, yPos, { align: 'center' });

            yPos += 8;

            // Grid de estadísticas
            const boxWidth = (pageWidth - 40) / 3;
            const boxHeight = 25;
            const startX = 15;

            // Box 1: Total Tareas
            doc.setFillColor(...bgCard);
            doc.roundedRect(startX, yPos, boxWidth, boxHeight, 2, 2, 'F');
            doc.setDrawColor(...primaryColor);
            doc.setLineWidth(0.3);
            doc.roundedRect(startX, yPos, boxWidth, boxHeight, 2, 2, 'S');
            doc.setTextColor(...textMuted);
            doc.setFontSize(8);
            doc.setFont(undefined, 'bold');
            doc.text('TOTAL TAREAS', startX + boxWidth / 2, yPos + 8, { align: 'center' });
            doc.setTextColor(...primaryColor);
            doc.setFontSize(16);
            doc.text(String(tareasMes), startX + boxWidth / 2, yPos + 18, { align: 'center' });

            // Box 2: Neto Recaudado
            doc.setFillColor(...bgCard);
            doc.roundedRect(startX + boxWidth + 5, yPos, boxWidth, boxHeight, 2, 2, 'F');
            doc.setDrawColor(...primaryColor);
            doc.roundedRect(startX + boxWidth + 5, yPos, boxWidth, boxHeight, 2, 2, 'S');
            doc.setTextColor(...textMuted);
            doc.setFontSize(8);
            doc.text('NETO RECAUDADO', startX + boxWidth + 5 + boxWidth / 2, yPos + 8, { align: 'center' });
            doc.setTextColor(...primaryColor);
            doc.setFontSize(16);
            doc.text(this.formatCurrency(netoMes), startX + boxWidth + 5 + boxWidth / 2, yPos + 18, { align: 'center' });

            // Box 3: % Cumplimiento
            const percentageColor = this.getPercentageColorRGB(percentageMes);
            doc.setFillColor(...bgCard);
            doc.roundedRect(startX + (boxWidth + 5) * 2, yPos, boxWidth, boxHeight, 2, 2, 'F');
            doc.setDrawColor(...primaryColor);
            doc.roundedRect(startX + (boxWidth + 5) * 2, yPos, boxWidth, boxHeight, 2, 2, 'S');
            doc.setTextColor(...textMuted);
            doc.setFontSize(8);
            doc.text('% CUMPLIMIENTO', startX + (boxWidth + 5) * 2 + boxWidth / 2, yPos + 8, { align: 'center' });
            doc.setTextColor(...percentageColor);
            doc.setFontSize(16);
            doc.text(`${percentageMes}%`, startX + (boxWidth + 5) * 2 + boxWidth / 2, yPos + 18, { align: 'center' });

            yPos += 35;

            // Tabla de tareas si existen
            if (mesData.tareas && mesData.tareas.length > 0) {
                doc.setTextColor(...textColor);
                doc.setFontSize(12);
                doc.setFont(undefined, 'bold');
                doc.text('DETALLE DE TAREAS', 15, yPos);

                yPos += 8;

                // Headers de la tabla
                doc.setFillColor(...bgCard);
                doc.rect(15, yPos, pageWidth - 30, 10, 'F');
                doc.setDrawColor(...primaryColor);
                doc.setLineWidth(0.5);
                doc.line(15, yPos + 10, pageWidth - 15, yPos + 10);
                doc.setTextColor(...primaryColor);
                doc.setFontSize(7);
                doc.setFont(undefined, 'bold');
                doc.text('FECHA', 18, yPos + 7);
                doc.text('TIPOLOGÍA', 40, yPos + 7);
                doc.text('TIPO', 75, yPos + 7);
                doc.text('UBICACIÓN', 105, yPos + 7);
                doc.text('ESTADO', 148, yPos + 7);
                doc.text('VALOR', 175, yPos + 7);

                yPos += 10;

                // Filas de tareas - TODAS las tareas con manejo de múltiples páginas
                doc.setFont(undefined, 'normal');
                const tareasOrdenadas = mesData.tareas
                    .sort((a, b) => new Date(b.fecha_cierre || b.fecha_resolucion) - new Date(a.fecha_cierre || a.fecha_resolucion));
                
                let rowCount = 0;
                for (const tarea of tareasOrdenadas) {
                    // Si llegamos al final de la página, crear una nueva
                    if (yPos > pageHeight - 30) {
                        // Agregar nueva página
                        doc.addPage();
                        
                        // Aplicar fondo corporativo a la nueva página
                        applyPageBackground(false);
                        
                        yPos = 35; // Comenzar después del header reducido
                        
                        // Re-agregar headers de la tabla en la nueva página
                        doc.setFillColor(...bgCard);
                        doc.rect(15, yPos, pageWidth - 30, 10, 'F');
                        doc.setDrawColor(...primaryColor);
                        doc.setLineWidth(0.5);
                        doc.line(15, yPos + 10, pageWidth - 15, yPos + 10);
                        doc.setTextColor(...primaryColor);
                        doc.setFontSize(7);
                        doc.setFont(undefined, 'bold');
                        doc.text('FECHA', 18, yPos + 7);
                        doc.text('TIPOLOGÍA', 40, yPos + 7);
                        doc.text('TIPO', 75, yPos + 7);
                        doc.text('UBICACIÓN', 105, yPos + 7);
                        doc.text('ESTADO', 148, yPos + 7);
                        doc.text('VALOR', 175, yPos + 7);
                        
                        yPos += 10;
                        doc.setFont(undefined, 'normal');
                        rowCount = 0; // Reiniciar contador para alternar colores
                    }

                    // Fila alternada con colores mejorados
                    if (rowCount % 2 === 0) {
                        doc.setFillColor(15, 18, 30);
                        doc.rect(15, yPos, pageWidth - 30, 8, 'F');
                    }

                    doc.setTextColor(...textColor);
                    doc.setFontSize(6.5);
                    
                    const fecha = new Date(tarea.fecha_cierre || tarea.fecha_resolucion).toLocaleDateString('es-CO', {
                        day: '2-digit',
                        month: '2-digit'
                    });
                    
                    const tipologia = (tarea.tipificacion || tarea.categoria || 'N/A').substring(0, 15);
                    const tipo = (tarea.tipo_actividad || tarea.tipo_origen || tarea.tipo || 'Tarea').substring(0, 12);
                    const ubicacion = (tarea.nombre_punto || tarea.ciudad || 'N/A').substring(0, 18);
                    const estado = (tarea.estado || tarea.estado_tarea || 'Cerrada').substring(0, 10);

                    doc.text(fecha, 18, yPos + 6);
                    doc.text(tipologia, 40, yPos + 6);
                    doc.text(tipo, 75, yPos + 6);
                    doc.text(ubicacion, 105, yPos + 6);
                    doc.text(estado, 148, yPos + 6);
                    
                    // Valor destacado
                    doc.setFontSize(7);
                    doc.setFont(undefined, 'bold');
                    doc.setTextColor(...primaryColor);
                    doc.text(this.formatCurrency(tarea.valor_neto), 175, yPos + 6);
                    doc.setFont(undefined, 'normal');
                    doc.setTextColor(...textColor);

                    yPos += 8;
                    rowCount++;
                }
            }

            // Footer en todas las páginas con diseño corporativo
            const totalPages = doc.internal.getNumberOfPages();
            for (let i = 1; i <= totalPages; i++) {
                doc.setPage(i);
                const footerY = pageHeight - 20;
                
                // Línea decorativa superior del footer
                doc.setDrawColor(...primaryColor);
                doc.setLineWidth(0.3);
                doc.line(15, footerY - 5, pageWidth - 15, footerY - 5);
                
                doc.setTextColor(...textMuted);
                doc.setFontSize(8);
                doc.setFont(undefined, 'normal');
                doc.text('Meta mensual: ' + this.formatCurrency(this.META_MENSUAL), pageWidth / 2, footerY, { align: 'center' });
                doc.setFontSize(7);
                doc.text('Documento generado automáticamente - Línea Comunicaciones', pageWidth / 2, footerY + 5, { align: 'center' });
                
                // Número de página
                doc.setTextColor(...primaryColor);
                doc.setFont(undefined, 'bold');
                doc.text(`${i} / ${totalPages}`, pageWidth - 20, footerY + 5, { align: 'right' });
            }

            // Guardar PDF
            const fileName = `liquidacion_${tech.nombre.replace(/\s+/g, '_')}_${targetMonth}.pdf`;
            doc.save(fileName);

            // Restaurar botón
            btn.innerHTML = '<span class="icon">✅</span><span>PDF Descargado</span>';
            setTimeout(() => {
                btn.innerHTML = originalHTML;
                btn.disabled = false;
            }, 2000);

        } catch (error) {
            console.error('Error generando PDF:', error);
            alert('Error al generar el PDF. Por favor intenta de nuevo.');
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }
    }

    getPercentageColorRGB(percentage) {
        if (percentage >= 100) return [72, 187, 120]; // Verde
        if (percentage >= 80) return [237, 137, 54]; // Naranja
        return [245, 101, 101]; // Rojo
    }

    handleError(error) {
        console.error('Error:', error);
        this.hideLoading();
        
        const container = document.querySelector('.container');
        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">⚠️</div>
                    <div class="empty-title">Error al cargar datos</div>
                    <div class="empty-text">${error.message}</div>
                    <button onclick="location.reload()" 
                            style="margin-top: 2rem; padding: 1rem 2rem; background: var(--accent-gradient); 
                                   color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 1rem; font-weight: 600;">
                        Reintentar
                    </button>
                </div>
            `;
        }
    }
}

// Inicializar
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new LiquidacionesApp();
});
// Mensaje de créditos en consola
console.log('%c╔═══════════════════════════════════════════════════════════════════╗', 'color: #3B82F6; font-weight: bold;');
console.log('%c║  Sistema de Producción - Linea Comunicaciones                    ║', 'color: #3B82F6; font-weight: bold;');
console.log('%c║                                                                   ║', 'color: #3B82F6;');
console.log('%c║  👨‍💻 Desarrollado por: Sebastian Gomez Lopez                      ║', 'color: #8B5CF6; font-weight: bold;');
console.log('%c║  💼 Desarrollador de Software                                     ║', 'color: #8B5CF6;');
console.log('%c║  🎓 Ingeniero de Sistemas en proceso                             ║', 'color: #8B5CF6;');
console.log('%c╚═══════════════════════════════════════════════════════════════════╝', 'color: #3B82F6; font-weight: bold;');