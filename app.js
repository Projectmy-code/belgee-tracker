let records = JSON.parse(localStorage.getItem('belgee_records')) || [];
let tariffs = JSON.parse(localStorage.getItem('belgee_tariffs')) || [];
let dailyLogs = JSON.parse(localStorage.getItem('belgee_daily_logs')) || [];
let barChart = null, pieChart = null;
let currentType = 'fuel';
let currentSettingsTab = 'electric';
let currentPeriod = 'all'; // 'all' или 'month'

// КОНСТАНТЫ БАКА
const TANK_MIN_LITERS = 3.0;
const TANK_PERCENT_100_LITERS = 46.0;
const TANK_EXTRA_LITERS = 4.0;

// База данных АЗС и видов топлива
const fuelDatabase = {
    "Белоруснефть": ["АИ-92", "АИ-95", "АИ-98", "ДТ (зимнее/летнее)", "ДТ «Арктика»", "СУГ (пропан-бутан)", "СПГ", "КПГ (метан)", "BN-92", "BN-95", "ECO DIESEL"],
    "Лукойл": ["АИ-92", "АИ-95", "АИ-98", "ДТ (Евро-5)", "СУГ (пропан-бутан)", "ЭКТО-100", "ЭКТО Diesel"],
    "Газпромнефть": ["АИ-92", "АИ-95", "ДТ (Евро-5)", "СУГ (пропан-бутан)", "G-Drive 95", "G-Drive Diesel"],
    "А-100": ["АИ-92", "АИ-95", "ДТ (Евро-5)", "СУГ (пропан-бутан)", "Топливо с присадками категории «А+»"],
    "Татнефть": ["АИ-92", "АИ-95", "АИ-98", "ДТ (Евро-5)", "СУГ (пропан-бутан)", "Taneco (ДТ и бензин)"],
    "United Company": ["АИ-92", "АИ-95", "АИ-98", "ДТ (Евро-5)", "СУГ (пропан-бутан)", "Линейка премиум-топлива"]
};

tariffs = tariffs.map(t => {
    if(!t.category) t.category = 'electric';
    if(t.category === 'electric' && !t.chargeType) t.chargeType = 'AC';
    return t;
});

function animateValue(obj, start, end, duration) {
    if(!obj) return;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 4);
        const current = Math.floor(easeOut * (end - start) + start);
        if(end % 1 !== 0) { obj.innerHTML = current.toFixed(1); }
        else { obj.innerHTML = current.toLocaleString('ru-RU'); }
        if (progress < 1) { window.requestAnimationFrame(step); }
    };
    window.requestAnimationFrame(step);
}

function switchView(viewName) {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${viewName}`).classList.add('active');
    document.getElementById(`nav-${viewName}`).classList.add('active');

    const title = document.getElementById('page-title');
    const addBtn = document.getElementById('header-add-btn');
    
    if(viewName === 'home') { title.innerText = 'Моя машина'; addBtn.style.display = 'flex'; updateDashboardCards(); }
    if(viewName === 'journal') { title.innerText = 'Журнал'; addBtn.style.display = 'flex'; renderJournal(); }
    if(viewName === 'settings') { title.innerText = 'Настройки'; addBtn.style.display = 'none'; renderTariffs(); }
}

// --- ПЕРИОД СТАТИСТИКИ ---
function setPeriod(period) {
    currentPeriod = period;
    document.getElementById('btn-period-all').classList.toggle('active', period === 'all');
    document.getElementById('btn-period-month').classList.toggle('active', period === 'month');
    document.getElementById('period-label').innerText = period === 'all' ? 'за всё время' : 'за этот месяц';
    updateStats();
}

function updateStats() {
    let filtered = records;
    if (currentPeriod === 'month') {
        const now = new Date();
        filtered = records.filter(r => {
            const d = new Date(r.date);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });
    }
    
    const spent = filtered.reduce((sum, r) => sum + r.total, 0);
    animateValue(document.getElementById('total-spent'), 0, spent, 800);
    
    const avg = filtered.length > 0 ? spent / filtered.length : 0;
    // Мы не выводим средний чек в отдельной карточке, но можем обновить графики
    renderCharts(filtered);
}

// --- РАСЧЕТ СТОИМОСТИ 1 КМ ---
function calculateCostPerKm() {
    // Берем только записи, где указан пробег (чтобы не было деления на 0)
    const recordsWithOdo = records.filter(r => r.odometer > 0);
    if (recordsWithOdo.length < 2) return 0;

    // Сортируем по пробегу
    recordsWithOdo.sort((a, b) => a.odometer - b.odometer);
    
    const minOdo = recordsWithOdo[0].odometer;
    const maxOdo = recordsWithOdo[recordsWithOdo.length - 1].odometer;
    const totalDist = maxOdo - minOdo;
    
    if (totalDist <= 0) return 0;

    // Считаем общие траты за этот период (суммируем все записи между min и max пробегом)
    let totalCost = 0;
    recordsWithOdo.forEach(r => {
        totalCost += r.total;
    });

    return totalCost / totalDist;
}
function calculateConsumption() {
    const fuelRecords = records.filter(r => r.type === 'fuel' && r.odometer > 0).sort((a,b) => a.odometer - b.odometer);
    if (fuelRecords.length < 2) return 0;
    
    let totalDist = fuelRecords[fuelRecords.length - 1].odometer - fuelRecords[0].odometer;
    let totalFuel = 0;
    for (let i = 1; i < fuelRecords.length; i++) {
        totalFuel += fuelRecords[i].amount;
    }
    return (totalFuel / totalDist) * 100;
}

function updateDashboardCards() {
    // 1. Расход топлива
    const consumption = calculateConsumption();
    animateValue(document.getElementById('avg-consumption'), 0, consumption, 800);

    // 2. Стоимость 1 км
    const costPerKm = calculateCostPerKm();
    animateValue(document.getElementById('cost-per-km'), 0, costPerKm, 800);
    
    // Подпись (сколько км учтено)
    const recordsWithOdo = records.filter(r => r.odometer > 0);
    if(recordsWithOdo.length >= 2) {
        recordsWithOdo.sort((a, b) => a.odometer - b.odometer);
        const dist = recordsWithOdo[recordsWithOdo.length - 1].odometer - recordsWithOdo[0].odometer;
        document.getElementById('cost-per-km-sub').innerText = `учтено ${dist} км пробега`;
    } else {
        document.getElementById('cost-per-km-sub').innerText = `нужно минимум 2 записи с пробегом`;
    }
    
    // 2. Статистика трат (учитывая период)
    updateStats();

    // 3. Статус авто (Батарея и Бак)
    if(dailyLogs.length > 0) {
        const sortedLogs = [...dailyLogs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const latestBattery = sortedLogs.find(l => l.battery !== null);
        const latestTank = sortedLogs.find(l => l.tankPercent !== null && l.tankPercent !== undefined);
        
        if(latestBattery) {
            const bEl = document.getElementById('battery-val');
            bEl.innerText = latestBattery.battery;
            const kwh = ((latestBattery.battery / 100) * 17).toFixed(1);
            const timeStr = latestBattery.timeType === 'start' ? 'Утро' : 'Вечер';
            document.getElementById('battery-subtext').innerText = `${kwh} из 17 кВт·ч · ${timeStr}`;
        }
        
        if(latestTank) {
            const tEl = document.getElementById('tank-val');
            tEl.innerText = latestTank.tankPercent;
            document.getElementById('tank-progress').style.width = latestTank.tankPercent + '%';
            const litersInTank = (TANK_MIN_LITERS + (latestTank.tankPercent / 100) * TANK_PERCENT_100_LITERS).toFixed(1);
            const totalLiters = (parseFloat(litersInTank) + TANK_EXTRA_LITERS).toFixed(1);
            const timeStr = latestTank.timeType === 'start' ? 'Утро' : 'Вечер';
            document.getElementById('tank-subtext').innerText = `${litersInTank} л (всего ${totalLiters} л) · ${timeStr}`;
        }
    }
    
    renderRecentList();
}

// --- БЫСТРАЯ ЗАРЯДКА ---
function openQuickCharge() {
    openModal();
    setType('electric');
    
    // Пытаемся найти домашнюю сеть
    const networkSelect = document.getElementById('network-select');
    let found = false;
    for (let opt of networkSelect.options) {
        if (opt.value.toLowerCase().includes('домашняя') || opt.value.toLowerCase().includes('розетка')) {
            networkSelect.value = opt.value;
            filterTariffsByNetwork();
            found = true;
            break;
        }
    }
    if (!found && networkSelect.options.length > 1) {
        networkSelect.selectedIndex = 1; // Берем первую доступную
        filterTariffsByNetwork();
    }
}

// --- СТАТУС АВТО (НАЧАЛО/КОНЕЦ ДНЯ) ---
let currentDailyTime = 'start';

function openDailyModal(type) {
    document.getElementById('daily-modal').classList.add('active');
    document.getElementById('daily-form').reset();
    
    const lastLog = dailyLogs.length > 0 ? dailyLogs[dailyLogs.length - 1] : null;
    if(lastLog) {
        document.getElementById('daily-battery').value = lastLog.battery || '';
        if(lastLog.tankPercent !== undefined && lastLog.tankPercent !== null) {
            document.getElementById('daily-tank-percent').value = lastLog.tankPercent;
            updateTankHint(lastLog.tankPercent);
        }
    }
    setDailyTime('start');
}

function closeDailyModal() { document.getElementById('daily-modal').classList.remove('active'); }

function setDailyTime(time) {
    currentDailyTime = time;
    document.querySelectorAll('#daily-time-selector .segment-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-time') === time);
    });
}

function updateTankHint(percent) {
    const hint = document.getElementById('tank-liters-hint');
    if(isNaN(percent) || percent === '') { hint.style.display = 'none'; return; }
    const liters = (TANK_MIN_LITERS + (percent / 100) * TANK_PERCENT_100_LITERS).toFixed(1);
    hint.innerText = `≈ ${liters} литров в баке (плюс 4 л под горловину)`;
    hint.style.display = 'block';
}

document.getElementById('daily-tank-percent').addEventListener('input', (e) => {
    updateTankHint(e.target.value);
});

function saveDailyStatus(event) {
    event.preventDefault();
    const battery = parseFloat(document.getElementById('daily-battery').value);
    const tankPercent = parseFloat(document.getElementById('daily-tank-percent').value);
    const today = new Date().toISOString().split('T')[0];
    
    dailyLogs.push({
        id: Date.now(), date: today, timeType: currentDailyTime,
        battery: isNaN(battery) ? null : battery,
        tankPercent: isNaN(tankPercent) ? null : tankPercent,
        timestamp: new Date().toISOString()
    });
    
    localStorage.setItem('belgee_daily_logs', JSON.stringify(dailyLogs));
    updateDashboardCards();
    closeDailyModal();
    showToast('Статус сохранен!');
}

// --- НАСТРОЙКИ И ТАРИФЫ ---
function switchSettingsTab(tab) {
    currentSettingsTab = tab;
    document.getElementById('btn-settings-electric').classList.toggle('active', tab === 'electric');
    document.getElementById('btn-settings-fuel').classList.toggle('active', tab === 'fuel');
    document.getElementById('tariff-form-electric').style.display = tab === 'electric' ? 'block' : 'none';
    document.getElementById('tariff-form-fuel').style.display = tab === 'fuel' ? 'block' : 'none';
    if(tab === 'fuel') populateFuelStations();
}

function populateFuelStations() {
    const select = document.getElementById('fuel-station');
    if(select.options.length > 1) return;
    select.innerHTML = '<option value="" disabled selected>-- Выберите АЗС --</option>';
    Object.keys(fuelDatabase).forEach(station => {
        select.innerHTML += `<option value="${station}">${station}</option>`;
    });
}

function updateFuelTypes() {
    const station = document.getElementById('fuel-station').value;
    const typeSelect = document.getElementById('fuel-type');
    if(!station) return;
    typeSelect.innerHTML = '<option value="" disabled selected>-- Выберите топливо --</option>';
    fuelDatabase[station].forEach(type => {
        typeSelect.innerHTML += `<option value="${type}">${type}</option>`;
    });
}

function renderTariffs() {
    const container = document.getElementById('tariff-list');
    if (tariffs.length === 0) { container.innerHTML = '<div class="empty-state">Тарифы не добавлены.</div>'; return; }
    container.innerHTML = tariffs.map(t => {
        const isFuel = t.category === 'fuel';
        const borderColor = isFuel ? 'var(--orange)' : 'var(--blue)';
        const details = isFuel ? `Цена: ${t.price} Br/л` : `Цена: ${t.price} Br/кВт·ч | ${t.start} - ${t.end}`;
        const badge = (!isFuel && t.chargeType) ? `<span style="font-size: 10px; background: ${t.chargeType === 'DC' ? '#0a84ff' : '#555'}; padding: 2px 6px; border-radius: 4px; color: white; margin-left: 5px;">${t.chargeType}</span>` : '';
        const nameStr = isFuel ? `${t.network} • ${t.name}` : `${t.network} | ${t.name}${badge}`;
        
        return `<div class="tariff-item" style="border-left-color: ${borderColor};">
            <div class="tariff-info">
                <h4>${isFuel ? '⛽' : '⚡'} ${nameStr}</h4>
                <span>${details}</span>
            </div>
            <button class="btn-delete" onclick="deleteTariff(${t.id})">Удалить</button>
        </div>`;
    }).join('');
}

function saveTariff(event, category) {
    event.preventDefault();
    if(category === 'electric') {
        const network = document.getElementById('electric-network').value;
        const name = document.getElementById('electric-name').value;
        const price = parseFloat(document.getElementById('electric-price').value);
        const start = document.getElementById('electric-start').value;
        const end = document.getElementById('electric-end').value;
        const chargeType = document.getElementById('electric-charge-type').value;
        tariffs.push({ id: Date.now(), category, network, name, price, start, end, chargeType });
        document.getElementById('tariff-form-electric').reset();
    } else {
        const network = document.getElementById('fuel-station').value;
        const name = document.getElementById('fuel-type').value;
        const price = parseFloat(document.getElementById('fuel-price').value);
        tariffs.push({ id: Date.now(), category, network, name, price });
        document.getElementById('tariff-form-fuel').reset();
        document.getElementById('fuel-type').innerHTML = '<option value="" disabled selected>-- Сначала выберите АЗС --</option>';
    }
    localStorage.setItem('belgee_tariffs', JSON.stringify(tariffs));
    renderTariffs(); showToast('Сохранено!');
}

function deleteTariff(id) {
    tariffs = tariffs.filter(t => t.id !== id);
    localStorage.setItem('belgee_tariffs', JSON.stringify(tariffs));
    renderTariffs();
}

// --- ФОРМА ЗАПИСИ ---
const modal = document.getElementById('modal');
const form = document.getElementById('record-form');
const amountInput = document.getElementById('amount');
const priceInput = document.getElementById('price');
const odoInput = document.getElementById('odometer');
const totalCostText = document.getElementById('total-cost');

function setType(type) {
    currentType = type;
    document.querySelectorAll('#type-selector .segment-btn').forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-type') === type));
    updateFormLabels();
}

function openModal() {
    modal.classList.add('active'); form.reset(); totalCostText.innerText = '0.00 Br';
    document.getElementById('network-select-group').style.display = 'block';
    document.getElementById('tariff-select-group').style.display = 'none';
    setType('fuel');
}

function closeModal() { modal.classList.remove('active'); }
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

function updateFormLabels() {
    const isFuel = currentType === 'fuel';
    document.getElementById('unit-label').innerText = isFuel ? 'литры' : 'кВт·ч';
    document.getElementById('price-label').innerText = isFuel ? 'литр' : 'кВт·ч';
    document.getElementById('network-label').innerText = isFuel ? 'АЗС и топливо' : 'Сеть зарядок';
    
    document.getElementById('tariff-select-group').style.display = isFuel ? 'none' : 'block';
    priceInput.value = '';
    populateNetworks();
    calculateTotal();
}

function populateNetworks() {
    const select = document.getElementById('network-select');
    const tariffSelect = document.getElementById('tariff-select');
    
    if (currentType === 'fuel') {
        const fuelTariffs = tariffs.filter(t => t.category === 'fuel');
        const uniqueOptions = [...new Set(fuelTariffs.map(t => `${t.network}|${t.name}`))];
        if (uniqueOptions.length === 0) {
            select.innerHTML = `<option value="">-- Нет сохраненных цен --</option>`;
            return;
        }
        select.innerHTML = '<option value="">-- Выберите АЗС и топливо --</option>' + 
            uniqueOptions.map(opt => `<option value="${opt}">${opt.replace('|', ' • ')}</option>`).join('');
    } else {
        const electricTariffs = tariffs.filter(t => t.category === 'electric');
        const uniqueNetworks = [...new Set(electricTariffs.map(t => t.network))];
        if (uniqueNetworks.length === 0) {
            select.innerHTML = `<option value="">-- Сначала добавьте тариф --</option>`;
            tariffSelect.innerHTML = '<option value="">-- Нет тарифов --</option>';
            return;
        }
        select.innerHTML = '<option value="">-- Выберите сеть --</option>' + uniqueNetworks.map(net => `<option value="${net}">${net}</option>`).join('');
        tariffSelect.innerHTML = '<option value="">-- Сначала выберите сеть --</option>';
    }
}

function filterTariffsByNetwork() {
    const network = document.getElementById('network-select').value;
    const tariffSelect = document.getElementById('tariff-select');
    if(!network) { priceInput.value = ''; return; }
    
    if (currentType === 'fuel') {
        const [station, fuelType] = network.split('|');
        const filtered = tariffs.find(t => t.category === 'fuel' && t.network === station && t.name === fuelType);
        if (filtered) { priceInput.value = filtered.price; calculateTotal(); }
    } else {
        const filtered = tariffs.filter(t => t.category === 'electric' && t.network === network);
        tariffSelect.innerHTML = '<option value="">-- Выберите тариф --</option>' + filtered.map(t => `<option value="${t.id}">${t.name} (${t.chargeType || 'AC'}) - ${t.price} Br</option>`).join('');
        
        const now = new Date(); const currentMins = now.getHours() * 60 + now.getMinutes();
        let autoTariff = null;
        for (let t of filtered) {
            const [sH, sM] = t.start.split(':').map(Number); const [eH, eM] = t.end.split(':').map(Number);
            const sMins = sH * 60 + sM, eMins = eH * 60 + eM;
            if (sMins < eMins ? (currentMins >= sMins && currentMins < eMins) : (currentMins >= sMins || currentMins < eMins)) { autoTariff = t; break; }
        }
        if (autoTariff) {
            tariffSelect.value = autoTariff.id;
            priceInput.value = autoTariff.price;
            showToast(`Автовыбор: ${autoTariff.name}`);
        } else { priceInput.value = ''; }
        calculateTotal();
    }
}

function applyTariff() {
    const select = document.getElementById('tariff-select');
    if(select.value) {
        const tariff = tariffs.find(t => t.id == select.value);
        if(tariff) { priceInput.value = tariff.price; calculateTotal(); }
    } else { priceInput.value = ''; calculateTotal(); }
}

function calculateTotal() {
    const amount = parseFloat(amountInput.value) || 0;
    const price = parseFloat(priceInput.value) || 0;
    totalCostText.innerText = (amount * price).toFixed(2) + ' Br';
}

amountInput.addEventListener('input', calculateTotal);
priceInput.addEventListener('input', calculateTotal);

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.innerText = message; toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function saveRecord(event) {
    event.preventDefault();
    const amount = parseFloat(amountInput.value);
    const price = parseFloat(priceInput.value);
    const total = parseFloat((amount * price).toFixed(2));
    const network = document.getElementById('network-select').value || null;
    const odometerVal = parseFloat(odoInput.value) || null;
    const batteryVal = parseFloat(document.getElementById('battery-level').value) || null;
    
    records.push({ id: Date.now(), type: currentType, network: network, amount: amount, price: price, total: total, odometer: odometerVal, batteryLevel: batteryVal, date: new Date().toISOString() });
    
    localStorage.setItem('belgee_records', JSON.stringify(records));
    
    updateDashboardCards();
    closeModal(); showToast('Запись добавлена!');
    if(document.getElementById('view-journal').classList.contains('active')) renderJournal();
}

// --- ГРАФИКИ (с учетом периода) ---
function renderCharts(filteredRecords = records) {
    const groupedData = {};
    let totalFuel = 0, totalElectric = 0;
    
    filteredRecords.forEach(rec => {
        const dateStr = new Date(rec.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
        if(!groupedData[dateStr]) groupedData[dateStr] = { fuel: 0, electric: 0 };
        if(rec.type === 'fuel') { groupedData[dateStr].fuel += rec.total; totalFuel += rec.total; }
        else { groupedData[dateStr].electric += rec.total; totalElectric += rec.total; }
    });
    
    const labels = Object.keys(groupedData).slice(-7);
    
    const barCtx = document.getElementById('costChart').getContext('2d');
    if (barChart) barChart.destroy();
    barChart = new Chart(barCtx, {
        type: 'bar',
        data: { labels: labels.length ? labels : ['Нет данных'], datasets: [
            { label: 'Бензин', data: labels.map(l => groupedData[l].fuel), backgroundColor: '#ff9f0a', borderRadius: 4 },
            { label: 'Электро', data: labels.map(l => groupedData[l].electric), backgroundColor: '#0a84ff', borderRadius: 4 }
        ]},
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true, grid: { display: false }, ticks: { color: '#a1a1aa' } }, y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#a1a1aa' } } }, plugins: { legend: { display: false } } }
    });

    const pieCtx = document.getElementById('ratioChart').getContext('2d');
    if (pieChart) pieChart.destroy();
    pieChart = new Chart(pieCtx, {
        type: 'doughnut',
        data: { labels: ['Бензин', 'Электро'], datasets: [{ data: [totalFuel, totalElectric], backgroundColor: ['#ff9f0a', '#0a84ff'], borderWidth: 0, hoverOffset: 5 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom', labels: { color: '#ffffff', usePointStyle: true, boxWidth: 8 } } } }
    });
}

// --- ВСПОМОГАТЕЛЬНЫЕ ---
function clearAllData() {
    if(confirm('Удалить ВСЕ данные?')) {
        localStorage.clear();
        location.reload();
    }
}

function generateDemoData() {
    if(records.length > 0 && !confirm('Добавить демо-данные?')) return;
    const networks = ['Malanka', 'forEVo', 'Домашняя (Розетка)'];
    let currentOdo = 15000;
    
    // Добавим тарифы, если их нет
    if(tariffs.length === 0) {
        tariffs.push({ id: 1, category: 'electric', network: 'Malanka', name: 'Ночной', price: 2.5, start: '23:00', end: '07:00', chargeType: 'AC' });
        tariffs.push({ id: 2, category: 'fuel', network: 'Белоруснефть', name: 'АИ-95', price: 2.1 });
        localStorage.setItem('belgee_tariffs', JSON.stringify(tariffs));
    }

    for(let i=0; i<15; i++) {
        const date = new Date(); date.setDate(date.getDate() - Math.floor(Math.random() * 30));
        currentOdo += Math.floor(Math.random() * 300) + 50;
        const isFuel = Math.random() > 0.4;
        const amount = isFuel ? Math.floor(Math.random() * 30) + 10 : Math.floor(Math.random() * 20) + 5;
        const price = isFuel ? 2.10 : 0.30;
        
        let network = isFuel ? 'Белоруснефть|АИ-95' : networks[Math.floor(Math.random() * networks.length)];

        records.push({
            id: Date.now() + i, type: isFuel ? 'fuel' : 'electric',
            network: network,
            amount: parseFloat(amount.toFixed(1)), price: parseFloat(price.toFixed(2)),
            total: parseFloat((amount * price).toFixed(2)), odometer: currentOdo, 
            batteryLevel: Math.floor(Math.random() * 60) + 20,
            date: date.toISOString()
        });
    }
    
    localStorage.setItem('belgee_records', JSON.stringify(records));
    updateDashboardCards(); 
    switchView('home'); 
    showToast('Демо-данные добавлены!');
}

function renderJournal() {
    const container = document.getElementById('journal-list');
    if (records.length === 0) { container.innerHTML = '<div class="empty-state">Записей пока нет.</div>'; return; }
    const sorted = [...records].sort((a, b) => new Date(b.date) - new Date(a.date));
    container.innerHTML = sorted.map(rec => {
        const icon = rec.type === 'fuel' ? '⛽' : '⚡';
        const color = rec.type === 'fuel' ? 'var(--orange)' : 'var(--blue)';
        const unit = rec.type === 'fuel' ? 'л' : 'кВт·ч';
        const date = new Date(rec.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
        
        let displayNetwork = rec.network || '';
        if(rec.type === 'fuel' && displayNetwork.includes('|')) displayNetwork = displayNetwork.replace('|', ' • ');
        const networkHtml = displayNetwork ? `<span class="network-badge">${displayNetwork}</span>` : '';
        
        const odoText = rec.odometer ? `· Пробег: ${rec.odometer} км` : '';
        const battText = rec.batteryLevel ? `· 🔋 ${rec.batteryLevel}%` : '';
        const detailsText = [date, odoText, battText].filter(Boolean).join(' ');
        
        return `<div class="journal-item glass"><div class="journal-info"><h4>${icon} ${rec.amount} ${unit} ${networkHtml} <span style="color: var(--text-muted); font-size: 14px;">· ${rec.price} Br/${unit}</span></h4><p>${detailsText}</p></div><div class="journal-price" style="color: ${color}">${rec.total.toFixed(0)} Br</div></div>`;
    }).join('');
}

function renderRecentList() {
    const container = document.getElementById('recent-list');
    if (records.length === 0) { container.innerHTML = '<div class="empty-state">Пока нет записей. Нажмите «+»</div>'; return; }
    const recent = [...records].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 3);
    container.innerHTML = recent.map(rec => {
        const icon = rec.type === 'fuel' ? '⛽' : '⚡';
        const color = rec.type === 'fuel' ? 'var(--orange)' : 'var(--blue)';
        const date = new Date(rec.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
        
        let displayNetwork = rec.network || '';
        if(rec.type === 'fuel' && displayNetwork.includes('|')) displayNetwork = displayNetwork.replace('|', ' • ');
        const networkHtml = displayNetwork ? `<span class="network-badge">${displayNetwork}</span>` : '';
        
        const odoText = rec.odometer ? `· ${rec.odometer} км` : '';
        const battText = rec.batteryLevel ? `· 🔋 ${rec.batteryLevel}%` : '';
        const detailsText = [date, odoText, battText].filter(Boolean).join(' ');
        
        return `<div class="recent-item"><div class="recent-item-left"><span class="recent-icon">${icon}</span><div><div>${rec.amount} ${rec.type === 'fuel' ? 'л' : 'кВт·ч'} ${networkHtml}</div><div class="recent-date">${detailsText}</div></div></div><div class="recent-amount" style="color: ${color}">${rec.total.toFixed(0)} Br</div></div>`;
    }).join('');
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.counter').forEach(el => {
        if(el.id === 'total-spent' || el.id === 'avg-check') return;
        animateValue(el, 0, parseFloat(el.getAttribute('data-target')), 1500);
    });
    setTimeout(() => { document.getElementById('tank-progress').style.width = '65%'; }, 500);
    
    updateDashboardCards(); 
    renderTariffs();
});

