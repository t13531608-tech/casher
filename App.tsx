import { useEffect, useMemo, useState } from "react";
import {
  Activity, BarChart3, Bell, Check, ChevronDown, CircleAlert, ClipboardList, CloudUpload,
  Coffee, FilePlus2, FileText, Gauge, LayoutDashboard, LifeBuoy, Loader2, LogOut,
  Menu, MessageCircle, PackageX, Plus, Receipt, Search, Send, Settings, Star, Users,
  Wrench, X, RefreshCw, TrendingUp, Wallet, CalendarDays, Paperclip
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";
type Report = { id:string; type:string; branch:string; reportDate:string; payload:any; telegramStatus:string; createdAt:string; attachments:any[]; attempts:any[] };
const types = [
  {id:"sales",name:"المبيعات",icon:BarChart3},
  {id:"expenses",name:"المصروفات",icon:Receipt},
  {id:"waste",name:"التالف والهدر",icon:PackageX},
  {id:"maintenance",name:"الصيانة",icon:Wrench},
  {id:"employees",name:"تقييم الموظفين",icon:Star}
];
const today = () => new Date().toISOString().slice(0,10);
const money = (v:any) => new Intl.NumberFormat("ar-SA",{style:"currency",currency:"SAR",maximumFractionDigits:2}).format(Number(v||0));
const dateText = (v:string) => new Date(v).toLocaleDateString("ar-SA");
const typeName = (id:string) => types.find(t=>t.id===id)?.name || id;
async function api(path:string, options:RequestInit={}) {
  const res = await fetch(API+path, options);
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.error || "تعذر تنفيذ الطلب.");
  return data;
}
function App() {
  const [page,setPage] = useState("dashboard");
  const [mobileOpen,setMobileOpen] = useState(false);
  const [toast,setToast] = useState<{text:string;kind:"ok"|"error"}|null>(null);
  const [dashboard,setDashboard] = useState<any>(null);
  const [reports,setReports] = useState<Report[]>([]);
  const [loading,setLoading] = useState(false);
  const [query,setQuery] = useState("");
  const [filter,setFilter] = useState("all");
  const [selected,setSelected] = useState<Report|null>(null);
  const [settings,setSettings] = useState({token:"",chatId:"",configured:false,tokenMasked:""});
  const [branch,setBranch] = useState("");
  const [reportType,setReportType] = useState("sales");
  const [date,setDate] = useState(today());
  const [fields,setFields] = useState<Record<string,string>>({});
  const [attachments,setAttachments] = useState<FileList|null>(null);
  const [saving,setSaving] = useState(false);
  const [testLoading,setTestLoading] = useState(false);

  const notify = (text:string,kind:"ok"|"error"="ok") => { setToast({text,kind}); window.setTimeout(()=>setToast(null),3600); };
  const loadDashboard = async()=>{ try { setDashboard(await api("/api/dashboard")); } catch(e:any){notify(e.message,"error");} };
  const loadReports = async()=>{ setLoading(true); try { setReports(await api(`/api/reports?q=${encodeURIComponent(query)}&type=${filter}`)); } catch(e:any){notify(e.message,"error");} finally{setLoading(false);} };
  const loadSettings = async()=>{try{setSettings(s=>({...s,...await api("/api/settings/telegram")}));}catch(e:any){notify(e.message,"error");}};
  useEffect(()=>{loadDashboard();loadSettings();},[]);
  useEffect(()=>{if(page==="reports")loadReports();},[page,filter]);
  useEffect(()=>{if(page==="reports"){const t=window.setTimeout(loadReports,250);return()=>clearTimeout(t);}},[query]);
  useEffect(()=>{setFields({});setAttachments(null);},[reportType]);
  const nav = [
    {id:"dashboard",label:"الرئيسية",icon:LayoutDashboard},
    {id:"new",label:"إضافة تقرير",icon:FilePlus2},
    {id:"reports",label:"سجل التقارير",icon:ClipboardList},
    {id:"settings",label:"الإعدادات",icon:Settings}
  ];
  const setField=(key:string,value:string)=>setFields(old=>({...old,[key]:value}));
  const totalWaste=Number(fields.quantity||0)*Number(fields.unitCost||0);
  const salesDiff=Number(fields.totalSales||0)-Number(fields.target||0);
  const formFields:Record<string,any[]> = {
    sales:[
      {key:"totalSales",label:"إجمالي المبيعات",type:"number",required:true,placeholder:"0.00"},
      {key:"cashSales",label:"المبيعات النقدية",type:"number",required:true,placeholder:"0.00"},
      {key:"electronicSales",label:"المبيعات الإلكترونية",type:"number",required:true,placeholder:"0.00"},
      {key:"target",label:"المستهدف اليومي",type:"number",placeholder:"0.00"},
      {key:"notes",label:"ملاحظات",type:"textarea",wide:true}
    ],
    expenses:[
      {key:"category",label:"نوع المصروف",type:"select",options:["مشتريات","رواتب","نقل وتوصيل","صيانة","فواتير وخدمات","أخرى"],required:true},
      {key:"amount",label:"المبلغ",type:"number",required:true,placeholder:"0.00"},
      {key:"description",label:"وصف المصروف",type:"text",required:true,wide:true},
      {key:"notes",label:"ملاحظات",type:"textarea",wide:true}
    ],
    waste:[
      {key:"item",label:"اسم الصنف",type:"text",required:true},
      {key:"quantity",label:"الكمية التالفة",type:"number",required:true},
      {key:"unitCost",label:"تكلفة الوحدة",type:"number",required:true},
      {key:"reason",label:"سبب التلف",type:"select",options:["انتهاء الصلاحية","سوء التخزين","خطأ في التحضير","تلف أثناء النقل","أخرى"],required:true},
      {key:"responsible",label:"اسم المسؤول",type:"text"},
      {key:"notes",label:"ملاحظات",type:"textarea",wide:true}
    ],
    maintenance:[
      {key:"problem",label:"وصف المشكلة",type:"textarea",required:true,wide:true},
      {key:"priority",label:"درجة الأولوية",type:"select",options:["عاجل","متوسط","عادي"],required:true},
      {key:"responsible",label:"اسم المسؤول",type:"text"},
      {key:"status",label:"حالة البلاغ",type:"select",options:["مفتوح","قيد المعالجة","مكتمل"],required:true},
      {key:"cost",label:"تكلفة الإصلاح",type:"number",placeholder:"0.00"}
    ],
    employees:[
      {key:"employee",label:"اسم الموظف",type:"text",required:true},
      {key:"rating",label:"تقييم الأداء من 5",type:"select",options:["1","2","3","4","5"],required:true},
      {key:"commitment",label:"الالتزام",type:"select",options:["ممتاز","جيد جدًا","جيد","يحتاج تحسين"],required:true},
      {key:"quality",label:"جودة العمل",type:"select",options:["ممتاز","جيد جدًا","جيد","يحتاج تحسين"],required:true},
      {key:"customers",label:"التعامل مع العملاء",type:"select",options:["ممتاز","جيد جدًا","جيد","يحتاج تحسين"],required:true},
      {key:"managerNotes",label:"ملاحظات المدير",type:"textarea",wide:true}
    ]
  };
  const startNew=(type="sales")=>{setReportType(type);setFields({});setBranch("");setDate(today());setAttachments(null);setPage("new");};
  const submitReport=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(!branch.trim()){notify("يرجى إدخال اسم الفرع.","error");return;}
    const required=formFields[reportType].filter(f=>f.required);
    if(required.some(f=>!String(fields[f.key]||"").trim())){notify("يرجى استكمال الحقول المطلوبة.","error");return;}
    if(reportType==="sales" && Math.abs(Number(fields.cashSales||0)+Number(fields.electronicSales||0)-Number(fields.totalSales||0))>0.01){notify("مجموع النقدي والإلكتروني يجب أن يساوي إجمالي المبيعات.","error");return;}
    const payload:any={...fields};
    Object.keys(payload).forEach(k=>{if(["totalSales","cashSales","electronicSales","target","amount","quantity","unitCost","cost","rating"].includes(k))payload[k]=Number(payload[k]||0);});
    const data=new FormData();data.append("type",reportType);data.append("branch",branch);data.append("reportDate",date);data.append("payload",JSON.stringify(payload));
    if(attachments)Array.from(attachments).forEach(file=>data.append("attachments",file));
    setSaving(true);
    try{
      const result=await api("/api/reports",{method:"POST",body:data});
      if(result.delivery.status==="SENT")notify("تم حفظ التقرير وإرساله إلى Telegram بنجاح.");
      else notify("تم حفظ التقرير، لكن تعذر إرساله إلى Telegram: "+result.delivery.message,"error");
      setPage("reports");await loadDashboard();await loadReports();
    }catch(err:any){notify(err.message,"error");}
    finally{setSaving(false);}
  };
  const resend=async(id:string)=>{try{const r=await api(`/api/reports/${id}/resend`,{method:"POST"});notify(r.delivery.status==="SENT"?"تمت إعادة الإرسال بنجاح.":"فشلت إعادة الإرسال: "+r.delivery.message,r.delivery.status==="SENT"?"ok":"error");await loadReports();await loadDashboard();}catch(e:any){notify(e.message,"error");}};
  const saveSettings=async(e:React.FormEvent)=>{e.preventDefault();try{await api("/api/settings/telegram",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(settings)});notify("تم حفظ إعدادات Telegram.");setSettings(s=>({...s,token:""}));await loadSettings();}catch(e:any){notify((e as Error).message,"error");}};
  const testTelegram=async()=>{setTestLoading(true);try{await api("/api/settings/telegram/test",{method:"POST"});notify("وصلت رسالة الاختبار إلى Telegram.");}catch(e:any){notify((e as Error).message,"error");}finally{setTestLoading(false);}};
  const navTo=(id:string)=>{setPage(id);setMobileOpen(false);setSelected(null);};
  const activeTitle=nav.find(n=>n.id===page)?.label || (page==="detail"?"تفاصيل التقرير":"");
  const statusLabel=(s:string)=>s==="SENT"?"تم الإرسال":s==="FAILED"?"فشل الإرسال":"بانتظار الإرسال";
  const statusClass=(s:string)=>s==="SENT"?"success":s==="FAILED"?"danger":"pending";

  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen?"open":""}`}>
      <div className="brand"><div className="brand-mark"><Activity size={22}/></div><div><strong>رَصْد</strong><small>إدارة تشغيل الفروع</small></div><button className="close-nav" onClick={()=>setMobileOpen(false)}><X/></button></div>
      <div className="workspace"><span className="workspace-dot"/><div><b>مساحة العمل</b><small>الإدارة الرئيسية</small></div><ChevronDown size={15}/></div>
      <div className="nav-caption">القائمة الرئيسية</div>
      <nav>{nav.map(n=><button key={n.id} className={`nav-item ${page===n.id?"active":""}`} onClick={()=>navTo(n.id)}><n.icon size={19}/><span>{n.label}</span>{n.id==="reports"&&<span className="nav-count">{dashboard?.totalReports||0}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><LifeBuoy size={18}/></div><b>تحتاج إلى مساعدة؟</b><p>نظام بسيط لمتابعة تقارير الفروع.</p></div><div className="user-mini"><div className="avatar">م</div><div><b>مدير النظام</b><small>حساب تجريبي محلي</small></div><LogOut size={17}/></div></div>
    </aside>
    {mobileOpen&&<div className="scrim" onClick={()=>setMobileOpen(false)}/>}
    <main className="main-area">
      <header className="topbar"><div className="topbar-right"><button className="icon-button mobile-menu" onClick={()=>setMobileOpen(true)}><Menu/></button><div className="breadcrumb">رَصْد <span>/</span> <b>{activeTitle}</b></div></div><div className="topbar-left"><div className="today-label"><CalendarDays size={16}/>{new Date().toLocaleDateString("ar-SA",{weekday:"long",day:"numeric",month:"long"})}</div><div className="top-avatar">م</div></div></header>
      <div className="content">
        {page==="dashboard"&&<section>
          <div className="page-heading"><div><span className="eyebrow">نظرة عامة</span><h1>مرحبًا بك في رَصْد</h1><p>إليك ملخص أداء الفروع وحالة التقارير.</p></div><button className="primary-btn" onClick={()=>startNew()}><Plus size={18}/> تقرير جديد</button></div>
          <div className="stats-grid">
            <Stat icon={FileText} label="إجمالي التقارير" value={dashboard?.totalReports??"—"} hint="جميع التقارير المسجلة" />
            <Stat icon={Wallet} label="إجمالي المبيعات" value={dashboard?money(dashboard.totalSales):"—"} hint="حسب تقارير المبيعات" />
            <Stat icon={Wrench} label="بلاغات صيانة مفتوحة" value={dashboard?.openMaintenance??"—"} hint="تحتاج إلى متابعة" />
            <Stat icon={PackageX} label="قيمة التالف والهدر" value={dashboard?money(dashboard.totalWaste):"—"} hint="إجمالي الخسائر المسجلة" />
          </div>
          <div className="dashboard-grid">
            <div className="panel latest-panel"><div className="panel-head"><div><h3>أحدث التقارير</h3><p>آخر التقارير التي تم تسجيلها</p></div><button className="text-btn" onClick={()=>navTo("reports")}>عرض الكل <span>←</span></button></div>
              {dashboard?.latest?.length? <div className="latest-list">{dashboard.latest.map((r:Report)=><button className="latest-row" key={r.id} onClick={()=>{setSelected(r);setPage("detail");}}><div className="report-icon">{types.find(t=>t.id===r.type)?.icon && (()=>{const I=types.find(t=>t.id===r.type)!.icon;return <I size={18}/>})()}</div><div className="latest-info"><b>{typeName(r.type)}</b><small>{r.branch} · {dateText(r.reportDate)}</small></div><span className={`status ${statusClass(r.telegramStatus)}`}><i/>{statusLabel(r.telegramStatus)}</span><span className="row-arrow">←</span></button>)}</div>:<Empty title="لا توجد تقارير بعد" text="ابدأ بإضافة أول تقرير لتظهر البيانات هنا." action={()=>startNew()}/>}
            </div>
            <div className="panel telegram-panel"><div className="telegram-art"><div className="telegram-circle"><Send size={27}/></div><div className="orbit orbit-one"/><div className="orbit orbit-two"/></div><span className="eyebrow">التكامل والربط</span><h3>اتصال Telegram</h3><p>استقبل تقارير الفروع تلقائيًا في محادثة Telegram المحددة.</p><div className={`connection ${dashboard?.telegramConfigured?"connected":"disconnected"}`}><span/>{dashboard?.telegramConfigured?"الإعدادات مكتملة":"يحتاج إلى إعداد"}</div><button className="secondary-btn full" onClick={()=>navTo("settings")}><Settings size={16}/> إعداد الاتصال</button></div>
          </div>
          <div className="quick-section"><div className="section-title"><h3>إضافة تقرير سريع</h3><p>اختر نوع التقرير للبدء مباشرة</p></div><div className="quick-grid">{types.map(t=><button className="quick-card" key={t.id} onClick={()=>startNew(t.id)}><div className="quick-icon"><t.icon size={20}/></div><b>{t.name}</b><Plus size={17} className="quick-plus"/></button>)}</div></div>
        </section>}
        {page==="new"&&<section>
          <div className="page-heading"><div><span className="eyebrow">إدخال البيانات</span><h1>إضافة تقرير جديد</h1><p>أدخل البيانات الأساسية وسيتم حفظ التقرير وإرساله تلقائيًا.</p></div><button className="back-btn" onClick={()=>navTo("dashboard")}>العودة للرئيسية</button></div>
          <div className="form-layout"><div className="panel form-panel"><div className="form-top"><div className="form-step">01</div><div><h3>بيانات التقرير</h3><p>الحقول المعلّمة بنجمة مطلوبة</p></div></div>
            <form onSubmit={submitReport}>
              <div className="field-grid"><div className="field"><label>نوع التقرير <em>*</em></label><select value={reportType} onChange={e=>setReportType(e.target.value)}>{types.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select></div><div className="field"><label>اسم الفرع <em>*</em></label><input value={branch} onChange={e=>setBranch(e.target.value)} placeholder="مثال: فرع العليا" required/></div><div className="field"><label>تاريخ التقرير <em>*</em></label><input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></div>
              {formFields[reportType].map(f=><div key={f.key} className={`field ${f.wide?"wide":""}`}><label>{f.label} {f.required&&<em>*</em>}</label>{f.type==="textarea"?<textarea rows={3} value={fields[f.key]||""} onChange={e=>setField(f.key,e.target.value)} placeholder="اكتب التفاصيل هنا..."/>:f.type==="select"?<select value={fields[f.key]||""} onChange={e=>setField(f.key,e.target.value)} required={f.required}><option value="">اختر...</option>{f.options.map((o:string)=><option key={o}>{o}</option>)}</select>:<input type={f.type} min={f.type==="number"?0:undefined} step={f.type==="number"?"0.01":undefined} value={fields[f.key]||""} onChange={e=>setField(f.key,e.target.value)} placeholder={f.placeholder||"أدخل "+f.label} required={f.required}/>}</div>)}</div>
              {reportType==="sales"&&<div className="calculation"><div><small>الفرق عن المستهدف</small><b className={salesDiff>=0?"positive":"negative"}>{money(salesDiff)}</b></div><span>{salesDiff>=0?"أعلى من المستهدف":"أقل من المستهدف"}</span></div>}
              {reportType==="waste"&&<div className="calculation"><div><small>إجمالي الخسارة المحسوبة</small><b className="negative">{money(totalWaste)}</b></div><span>الكمية × تكلفة الوحدة</span></div>}
              <div className="field attachment-field"><label>المرفقات <small>(اختياري · حتى 5 صور، 8MB للصورة)</small></label><label className="upload-box"><CloudUpload size={23}/><b>اضغط لاختيار الصور</b><span>JPG أو PNG أو WEBP</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>setAttachments(e.target.files)}/></label>{attachments&&<div className="file-list">{Array.from(attachments).map(f=><span key={f.name}><Paperclip size={13}/>{f.name}</span>)}</div>}</div>
              <div className="form-actions"><button type="button" className="back-btn" onClick={()=>navTo("dashboard")}>إلغاء</button><button className="primary-btn" disabled={saving}>{saving?<Loader2 className="spin" size={17}/>:<Send size={17}/>} {saving?"جارٍ الحفظ والإرسال...":"حفظ وإرسال التقرير"}</button></div>
            </form>
          </div><div className="form-aside"><div className="tip-card"><div className="tip-icon"><MessageCircle/></div><h3>إرسال تلقائي إلى Telegram</h3><p>بعد حفظ التقرير، سيحاول النظام إرساله تلقائيًا إلى المحادثة المحددة.</p><div className="tip-status"><span className={dashboard?.telegramConfigured?"dot-green":"dot-orange"}/>{dashboard?.telegramConfigured?"إعداد Telegram مكتمل":"يرجى إعداد Telegram أولًا"}</div><button className="text-btn" onClick={()=>navTo("settings")}>الذهاب للإعدادات ←</button></div><div className="privacy-note"><CircleAlert size={17}/><p>لا تغلق الصفحة حتى تظهر نتيجة الحفظ. إذا تعذر الإرسال، سيظل التقرير محفوظًا ويمكن إعادة المحاولة من سجل التقارير.</p></div></div></div>
        </section>}
        {page==="reports"&&<section><div className="page-heading"><div><span className="eyebrow">الأرشيف</span><h1>سجل التقارير</h1><p>راجع التقارير السابقة وتابع حالة إرسالها.</p></div><button className="primary-btn" onClick={()=>startNew()}><Plus size={18}/> تقرير جديد</button></div>
          <div className="panel table-panel"><div className="table-toolbar"><div className="searchbox"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ابحث باسم الفرع أو رقم التقرير..."/></div><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">كل التقارير</option>{types.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select><button className="icon-button" onClick={loadReports} title="تحديث"><RefreshCw size={17}/></button></div>
          {loading?<div className="loading"><Loader2 className="spin"/> جارٍ تحميل التقارير...</div>:reports.length?<div className="table-wrap"><table><thead><tr><th>نوع التقرير</th><th>الفرع</th><th>التاريخ</th><th>حالة Telegram</th><th>المرفقات</th><th>الإجراء</th></tr></thead><tbody>{reports.map(r=><tr key={r.id}><td><b>{typeName(r.type)}</b><small className="id-text">{r.id.slice(-8)}</small></td><td>{r.branch}</td><td>{dateText(r.reportDate)}</td><td><span className={`status ${statusClass(r.telegramStatus)}`}><i/>{statusLabel(r.telegramStatus)}</span></td><td>{r.attachments?.length||0} صور</td><td><div className="table-actions"><button onClick={()=>{setSelected(r);setPage("detail");}}>عرض</button><button className="resend-btn" onClick={()=>resend(r.id)}><RefreshCw size={14}/> إعادة إرسال</button></div></td></tr>)}</tbody></table></div>:<Empty title="لا توجد نتائج" text="لم يتم العثور على تقارير مطابقة." action={()=>startNew()}/>}</div>
        </section>}
        {page==="detail"&&selected&&<section><div className="page-heading"><div><span className="eyebrow">تفاصيل السجل</span><h1>{typeName(selected.type)}</h1><p>{selected.branch} · {dateText(selected.reportDate)}</p></div><div className="heading-actions"><button className="back-btn" onClick={()=>navTo("reports")}>رجوع للسجل</button><button className="primary-btn" onClick={()=>resend(selected.id)}><RefreshCw size={16}/> إعادة الإرسال</button></div></div><div className="panel detail-panel"><div className="detail-meta"><span>رقم التقرير: {selected.id}</span><span className={`status ${statusClass(selected.telegramStatus)}`}><i/>{statusLabel(selected.telegramStatus)}</span></div><div className="detail-grid">{Object.entries(selected.payload||{}).filter(([k])=>k!=="loss").map(([k,v])=><div className="detail-item" key={k}><small>{k}</small><b>{String(v??"—")}</b></div>)}</div>{selected.type==="waste"&&<div className="detail-item"><small>إجمالي الخسارة</small><b>{money(selected.payload.loss)}</b></div>}<h3 className="subheading">المرفقات</h3>{selected.attachments?.length?<div className="attachment-links">{selected.attachments.map((a:any)=><a href={`${API}/api/attachments/${a.id}`} key={a.id} target="_blank"><Paperclip size={15}/>{a.fileName}</a>)}</div>:<p className="muted">لا توجد مرفقات.</p>}<h3 className="subheading">سجل محاولات الإرسال</h3>{selected.attempts?.length?selected.attempts.map((a:any)=><div className="attempt-row" key={a.id}><span className={`status ${statusClass(a.status)}`}><i/>{statusLabel(a.status)}</span><span>{a.message}</span><small>{new Date(a.attemptedAt).toLocaleString("ar-SA")}</small></div>):<p className="muted">لا توجد محاولات مسجلة.</p>}</div></section>}
        {page==="settings"&&<section><div className="page-heading"><div><span className="eyebrow">التكاملات</span><h1>الإعدادات</h1><p>إدارة ربط النظام مع Telegram.</p></div></div><div className="settings-layout"><div className="panel settings-panel"><div className="settings-title"><div className="telegram-small"><Send/></div><div><h3>إعداد Telegram Bot</h3><p>اربط النظام ببوت Telegram لاستقبال التقارير تلقائيًا.</p></div></div><form onSubmit={saveSettings}><div className="field"><label>Bot Token</label><input type="password" autoComplete="new-password" value={settings.token} onChange={e=>setSettings(s=>({...s,token:e.target.value}))} placeholder={settings.tokenMasked||"أدخل Bot Token من BotFather"}/><small>يُحفظ مشفرًا على الخادم ولا يُرسل إلى المتصفح بعد الحفظ.</small></div><div className="field"><label>Chat ID</label><input value={settings.chatId} onChange={e=>setSettings(s=>({...s,chatId:e.target.value}))} placeholder="مثال: -1001234567890" required/></div><div className="settings-actions"><button className="primary-btn"><Check size={17}/> حفظ الإعدادات</button><button type="button" className="secondary-btn" onClick={testTelegram} disabled={testLoading}>{testLoading?<Loader2 className="spin" size={16}/>:<Send size={16}/>} اختبار الاتصال</button></div></form></div><div className="panel connection-panel"><div className="connection-illustration"><MessageCircle size={32}/></div><h3>حالة الاتصال</h3><div className={`connection ${settings.configured?"connected":"disconnected"}`}><span/>{settings.configured?"تم حفظ إعدادات البوت":"غير متصل"}</div><p>{settings.configured?"الإعدادات موجودة. استخدم اختبار الاتصال للتأكد من وصول الرسائل فعليًا.":"أدخل بيانات البوت واحفظها لبدء استقبال التقارير."}</p><div className="security-note"><CircleAlert size={16}/><span>لا تشارك Bot Token مع أي شخص. من يملكه يمكنه التحكم في البوت.</span></div></div></div></section>}
      </div>
      <footer className="footer"><span>رَصْد © {new Date().getFullYear()}</span><span>نظام إدارة تقارير وتشغيل الفروع</span></footer>
    </main>
    {toast&&<div className={`toast ${toast.kind}`}><span>{toast.kind==="ok"?<Check size={18}/>:<CircleAlert size={18}/>}</span>{toast.text}<button onClick={()=>setToast(null)}><X size={16}/></button></div>}
  </div>;
}
function Stat({icon:Icon,label,value,hint}:any){return <div className="stat-card"><div className="stat-top"><span>{label}</span><div className="stat-icon"><Icon size={19}/></div></div><strong>{value}</strong><small>{hint}</small></div>}
function Empty({title,text,action}:any){return <div className="empty-state"><div className="empty-icon"><ClipboardList size={25}/></div><b>{title}</b><p>{text}</p><button className="text-btn" onClick={action}>إضافة تقرير جديد ←</button></div>}
export default App;
