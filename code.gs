/**
 * ระบบการนิเทศภายในโรงเรียน - Google Apps Script Backend (code.gs)
 * พัฒนาโดย: ครูเปิงมางfc
 * 
 * วิธีการติดตั้ง:
 * 1. สร้าง Google Sheet ใหม่ หรือใช้ไฟล์ที่มีอยู่
 * 2. ไปที่ ส่วนขยาย (Extensions) -> Apps Script
 * 3. ลบโค้ดเดิมออกทั้งหมด แล้วนำโค้ดในไฟล์นี้ไปวางแทนที่
 * 4. แก้ไขส่วน CONFIGURATION ด้านล่าง (ใส่ ID ของ Google Drive และ Google Sheet)
 * 5. กดปุ่มบันทึก (Save)
 * 6. กดปุ่ม การใช้งานจริง (Deploy) -> การปรับใช้แบบใหม่ (New deployment)
 *    - เลือกประเภทเป็น "เว็บแอป" (Web app)
 *    - ตั้งค่าการเรียกใช้ในฐานะ (Execute as): "ฉัน" (Me)
 *    - ตั้งค่าผู้มีสิทธิ์เข้าถึง (Who has access): "ทุกคน" (Anyone)
 *    - กด Deploy และคัดลอก Web App URL ที่ได้ไปใส่ในตัวแปร CONFIG.API_URL ในไฟล์ index.html
 */

// ==========================================
// CONFIGURATION (ส่วนการตั้งค่า)
// ==========================================

// 1. ID ของโฟลเดอร์ Google Drive สำหรับเก็บไฟล์ที่อัปโหลด (แผนการสอน, สื่อ, รูปภาพ)
var DRIVE_FOLDER_ID = "13pVmg7bTcmHOcUlTxfRNIK5MX8EbVfjx"; 

// 2. ID ของ Google Sheet สำหรับเก็บฐานข้อมูล (คัดลอกจาก URL ของชีต)
// เช่น จากลิงก์ https://docs.google.com/spreadsheets/d/1A2B3C4D5E.../edit
// ให้คัดลอกรหัสช่วง 1A2B3C4D5E... มาวางในเครื่องหมายอัญประกาศด้านล่างนี้
// (หากเปิดสคริปต์จากเมนู ส่วนขยาย ในชีตโดยตรง สามารถปล่อยว่างไว้เป็น "" ได้)
var SPREADSHEET_ID = "12sbaWTIz1JjSBVilA1BOUCvmqeITaBXXweXY14-_nUw"; 

// ==========================================
// CORE FUNCTIONS
// ==========================================

/**
 * ฟังก์ชันดึงออบเจกต์แผ่นงานสเปรดชีต (รอบรับการทำ Standalone Script)
 */
function getTargetSpreadsheet() {
  var ss = null;
  if (SPREADSHEET_ID && SPREADSHEET_ID.trim() !== "") {
    try {
      ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    } catch (e) {
      console.warn("ไม่สามารถดึงข้อมูลผ่าน SPREADSHEET_ID ได้: " + e.toString());
    }
  }
  
  if (!ss) {
    try {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    } catch (e) {
      console.warn("ไม่สามารถดึงข้อมูล Active Spreadsheet ได้: " + e.toString());
    }
  }
  
  if (!ss) {
    throw new Error("ระบบไม่สามารถระบุไฟล์ Google Sheets ได้ กรุณานำ ID ของไฟล์ชีตมาใส่ในตัวแปร SPREADSHEET_ID ที่ส่วนหัวของโค้ด");
  }
  
  return ss;
}

/**
 * ฟังก์ชันแสดงผลหน้าเว็บหลักเมื่อเปิดผ่าน Web App Link
 */
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('ระบบการนิเทศภายในโรงเรียนวัดบ้านดาบ')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * ฟังก์ชันสำหรับรับส่งข้อมูล API แบบ POST (CORS) สำหรับโฮสต์ภายนอก
 */
function doPost(e) {
  var response = { status: "error", message: "ไม่สามารถทำรายการได้" };
  try {
    var requestData = JSON.parse(e.postData.contents);
    var action = requestData.action;
    var data = requestData.payload || requestData.data;
    
    var result = executeActionFromServer(action, data);
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    response.message = err.toString();
    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * ฟังก์ชันหลักในการประมวลผลคำขอจากเว็บ (รองรับทั้ง doPost และ google.script.run)
 */
function executeActionFromServer(action, payload) {
  setupSystem(); // ตรวจสอบและเตรียมชีตก่อนเสมอ
  
  try {
    switch (action) {
      case "getDashboardData":
        return getDashboardData();
      case "getAdminData":
        return getAdminData();
      case "addBooking":
        return addBooking(payload);
      case "updateBooking":
        return updateBooking(payload);
      case "deleteBooking":
        return deleteBooking(payload);
      case "updateBookingStatus":
        return updateBookingStatus(payload);
      case "updateSubmissionStatus":
        return updateSubmissionStatus(payload);
      case "submitWork":
        return submitWork(payload);
      case "addEvaluation":
        return addEvaluation(payload);
      case "getSystemLogs":
        return getSystemLogs();
      default:
        return { status: "error", message: "ไม่พบ Action: " + action };
    }
  } catch (err) {
    return { status: "error", message: err.toString() };
  }
}

/**
 * ตรวจสอบและตั้งค่าแผ่นงาน Google Sheets อัตโนมัติ
 */
function setupSystem() {
  var ss = getTargetSpreadsheet();
  
  // 1. ชีตรายการจอง (Bookings)
  var sheetBookings = ss.getSheetByName("Bookings");
  if (!sheetBookings) {
    sheetBookings = ss.insertSheet("Bookings");
    sheetBookings.appendRow([
      "ID", "Timestamp", "TeacherName", "Department", "Date", 
      "Time", "Period", "Subject", "SubjectCode", "ClassRoom", "Status"
    ]);
    sheetBookings.getRange("A1:K1").setFontWeight("bold").setBackground("#E3F2FD");
  }
  
  // 2. ชีตการส่งงาน (Submissions)
  var sheetSubmissions = ss.getSheetByName("Submissions");
  if (!sheetSubmissions) {
    sheetSubmissions = ss.insertSheet("Submissions");
    sheetSubmissions.appendRow([
      "ID", "Timestamp", "TeacherName", "PlanUrl", "MediaUrl", 
      "Image1Url", "Image2Url", "Image3Url", "Image4Url", "ClipLink", "Status"
    ]);
    sheetSubmissions.getRange("A1:K1").setFontWeight("bold").setBackground("#E8F5E9");
  }
  
  // 3. ชีตการประเมินผล (Evaluations)
  var sheetEvaluations = ss.getSheetByName("Evaluations");
  if (!sheetEvaluations) {
    sheetEvaluations = ss.insertSheet("Evaluations");
    sheetEvaluations.appendRow([
      "ID", "Timestamp", "TeacherName", "Date", "Strengths", 
      "Improvement", "Suggestions", "Rating", "AverageScore", "ScoresJSON"
    ]);
    sheetEvaluations.getRange("A1:J1").setFontWeight("bold").setBackground("#FFFDE7");
  }
  
  // 4. ชีตบันทึกข้อผิดพลาด (SystemLogs)
  var sheetLogs = ss.getSheetByName("SystemLogs");
  if (!sheetLogs) {
    sheetLogs = ss.insertSheet("SystemLogs");
    sheetLogs.appendRow(["Timestamp", "Context", "Error"]);
    sheetLogs.getRange("A1:C1").setFontWeight("bold").setBackground("#FFCDD2");
  }
}

/**
 * โหลดข้อมูลสำหรับหน้าแรก (Dashboard)
 */
function getDashboardData() {
  var ss = getTargetSpreadsheet();
  var sheetBookings = ss.getSheetByName("Bookings");
  var sheetSubmissions = ss.getSheetByName("Submissions");
  var sheetEvaluations = ss.getSheetByName("Evaluations");
  
  var bookings = getSheetDataAsJson(sheetBookings);
  var submissions = getSheetDataAsJson(sheetSubmissions);
  var evaluations = getSheetDataAsJson(sheetEvaluations);
  
  // คำนวณสถิติ
  var totalBookings = bookings.length;
  var totalEvaluated = evaluations.length;
  var totalSubmissions = submissions.length;
  
  return {
    status: "success",
    stats: {
      totalBookings: totalBookings,
      totalEvaluated: totalEvaluated,
      totalSubmissions: totalSubmissions
    },
    latestBookings: bookings.slice(-10).reverse(), // ส่ง 10 รายการล่าสุด
    allBookings: bookings, // ส่งรายการจองทั้งหมดสำหรับแสดงผลบนปฏิทิน
    latestSubmissions: submissions.slice(-10).reverse(),
    latestEvaluations: evaluations.slice(-5).reverse() // ดึงข้อมูลผลการประเมิน 5 รายการล่าสุด
  };
}

/**
 * ดึงข้อมูลแอดมินทั้งหมด
 */
function getAdminData() {
  var ss = getTargetSpreadsheet();
  var sheetBookings = ss.getSheetByName("Bookings");
  var sheetSubmissions = ss.getSheetByName("Submissions");
  var sheetEvaluations = ss.getSheetByName("Evaluations");
  
  return {
    status: "success",
    bookings: getSheetDataAsJson(sheetBookings),
    submissions: getSheetDataAsJson(sheetSubmissions),
    evaluations: getSheetDataAsJson(sheetEvaluations)
  };
}

/**
 * เพิ่มข้อมูลการจองวันนิเทศ
 */
function addBooking(payload) {
  var ss = getTargetSpreadsheet();
  var sheet = ss.getSheetByName("Bookings");
  
  var id = "BK" + new Date().getTime();
  var timestamp = new Date();
  
  sheet.appendRow([
    id,
    timestamp,
    payload.teacherName,
    payload.department,
    payload.date,
    payload.time,
    payload.period,
    payload.subject,
    payload.subjectCode,
    payload.classRoom,
    "Pending" // สถานะเริ่มต้นเป็นรออนุมัติ
  ]);
  
  return { status: "success", id: id };
}

/**
 * แก้ไขข้อมูลการจองวันนิเทศ
 */
function updateBooking(payload) {
  var ss = getTargetSpreadsheet();
  var sheet = ss.getSheetByName("Bookings");
  var data = sheet.getDataRange().getValues();
  
  var id = payload.id;
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      // อัปเดตข้อมูลในแต่ละคอลัมน์ (เว้น ID และ Timestamp)
      sheet.getRange(i + 1, 3).setValue(payload.teacherName);
      sheet.getRange(i + 1, 4).setValue(payload.department);
      sheet.getRange(i + 1, 5).setValue(payload.date);
      sheet.getRange(i + 1, 6).setValue(payload.time);
      sheet.getRange(i + 1, 7).setValue(payload.period);
      sheet.getRange(i + 1, 8).setValue(payload.subject);
      sheet.getRange(i + 1, 9).setValue(payload.subjectCode);
      sheet.getRange(i + 1, 10).setValue(payload.classRoom);
      return { status: "success" };
    }
  }
  
  throw new Error("ไม่พบรายการจองรหัส: " + id);
}

/**
 * ลบข้อมูลการจองวันนิเทศ
 */
function deleteBooking(id) {
  var ss = getTargetSpreadsheet();
  var sheet = ss.getSheetByName("Bookings");
  var data = sheet.getDataRange().getValues();
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
      return { status: "success" };
    }
  }
  
  throw new Error("ไม่พบข้อมูลที่ต้องการลบ: " + id);
}

/**
 * อัปเดตสถานะการจองนิเทศ (อนุมัติ/ระงับ/ประเมินแล้ว)
 */
function updateBookingStatus(payload) {
  var ss = getTargetSpreadsheet();
  var sheet = ss.getSheetByName("Bookings");
  var data = sheet.getDataRange().getValues();
  
  var id = payload.id;
  var newStatus = payload.status;
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.getRange(i + 1, 11).setValue(newStatus);
      return { status: "success" };
    }
  }
  
  throw new Error("ไม่พบรายการจองรหัส: " + id);
}

/**
 * อัปเดตสถานะการส่งงาน (ผ่าน/ควรปรับปรุง)
 */
function updateSubmissionStatus(payload) {
  var ss = getTargetSpreadsheet();
  var sheet = ss.getSheetByName("Submissions");
  var data = sheet.getDataRange().getValues();
  
  var id = payload.id;
  var newStatus = payload.status;
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.getRange(i + 1, 11).setValue(newStatus);
      return { status: "success" };
    }
  }
  
  throw new Error("ไม่พบรายการส่งงานรหัส: " + id);
}

/**
 * อัปโหลดเอกสาร/ภาพไปยัง Google Drive และบันทึกข้อมูลการส่งงาน
 */
function submitWork(payload) {
  try {
    var folder = getUploadFolder();
    
    var planUrl = "";
    var mediaUrl = "";
    var img1Url = "";
    var img2Url = "";
    var img3Url = "";
    var img4Url = "";
    
    if (payload.planFile) planUrl = uploadBase64FileToDrive(payload.planFile, folder);
    if (payload.mediaFile) mediaUrl = uploadBase64FileToDrive(payload.mediaFile, folder);
    if (payload.image1) img1Url = uploadBase64FileToDrive(payload.image1, folder);
    if (payload.image2) img2Url = uploadBase64FileToDrive(payload.image2, folder);
    if (payload.image3) img3Url = uploadBase64FileToDrive(payload.image3, folder);
    if (payload.image4) img4Url = uploadBase64FileToDrive(payload.image4, folder);
    
    var ss = getTargetSpreadsheet();
    var sheet = ss.getSheetByName("Submissions");
    var data = sheet.getDataRange().getValues();
    
    // ค้นหาแถวการส่งงานเดิมของครูรายนี้จากล่างขึ้นบน
    var existingRowIndex = -1;
    for (var i = data.length - 1; i >= 1; i--) {
      if (data[i][2] === payload.teacherName) {
        existingRowIndex = i + 1; // ลำดับแถวแบบ 1-indexed
        break;
      }
    }
    
    var id;
    if (existingRowIndex !== -1) {
      // อัปเดตข้อมูลแถวเดิมที่มีอยู่แล้ว
      id = data[existingRowIndex - 1][0]; // ดึงรหัส ID เดิมไว้
      sheet.getRange(existingRowIndex, 2).setValue(new Date()); // อัปเดตวันเวลาส่งงานล่าสุด
      
      if (planUrl) sheet.getRange(existingRowIndex, 4).setValue(planUrl);
      if (mediaUrl) sheet.getRange(existingRowIndex, 5).setValue(mediaUrl);
      if (img1Url) sheet.getRange(existingRowIndex, 6).setValue(img1Url);
      if (img2Url) sheet.getRange(existingRowIndex, 7).setValue(img2Url);
      if (img3Url) sheet.getRange(existingRowIndex, 8).setValue(img3Url);
      if (img4Url) sheet.getRange(existingRowIndex, 9).setValue(img4Url);
      if (payload.clipLink !== undefined && payload.clipLink !== null) sheet.getRange(existingRowIndex, 10).setValue(payload.clipLink);
      
      sheet.getRange(existingRowIndex, 11).setValue("Pending"); // ตั้งสถานะเป็น รอการตรวจ อีกครั้งเพื่อให้แอดมินตรวจสอบใหม่
    } else {
      // ไม่พบข้อมูลการส่งงานเดิม ให้สร้างแถวใหม่
      id = "SB" + new Date().getTime();
      var timestamp = new Date();
      sheet.appendRow([
        id,
        timestamp,
        payload.teacherName,
        planUrl,
        mediaUrl,
        img1Url,
        img2Url,
        img3Url,
        img4Url,
        payload.clipLink || "",
        "Pending" // Status
      ]);
    }
    
    return { status: "success", id: id };
  } catch (err) {
    logError("submitWork", err);
    throw err;
  }
}

/**
 * เพิ่มบันทึกการประเมินนิเทศ
 */
function addEvaluation(payload) {
  var ss = getTargetSpreadsheet();
  var sheetEval = ss.getSheetByName("Evaluations");
  
  var id = "EV" + new Date().getTime();
  var timestamp = new Date();
  
  // บันทึกการประเมิน
  sheetEval.appendRow([
    id,
    timestamp,
    payload.teacherName,
    payload.date,
    payload.strengths,
    payload.improvement,
    payload.suggestions,
    payload.rating,
    payload.averageScore,
    JSON.stringify(payload.scores) // Scores JSON string
  ]);
  
  // ค้นหารายการจองที่เป็น Confirmed ของครูท่านนี้ เพื่อปรับเป็น Supervised (นิเทศแล้ว)
  var sheetBookings = ss.getSheetByName("Bookings");
  var bookingData = sheetBookings.getDataRange().getValues();
  for (var i = 1; i < bookingData.length; i++) {
    var tName = bookingData[i][2];
    var status = bookingData[i][10];
    if (tName === payload.teacherName && status === "Confirmed") {
      sheetBookings.getRange(i + 1, 11).setValue("Supervised");
      break;
    }
  }

  // ค้นหารายการส่งงาน (Submissions) ล่าสุดที่เป็น Pending ของครูท่านนี้ เพื่อปรับเป็น Passed (ผ่านการตรวจ)
  try {
    var sheetSubmissions = ss.getSheetByName("Submissions");
    var submissionData = sheetSubmissions.getDataRange().getValues();
    for (var i = submissionData.length - 1; i >= 1; i--) {
      var subName = submissionData[i][2];
      var subStatus = submissionData[i][10];
      if (subName === payload.teacherName && subStatus === "Pending") {
        sheetSubmissions.getRange(i + 1, 11).setValue("Passed");
        break;
      }
    }
  } catch (subErr) {
    console.warn("ไม่สามารถปรับสถานะการส่งงานเป็นตรวจแล้วได้: " + subErr.toString());
  }
  
  return { status: "success", id: id };
}

// ==========================================
// UTILITY FUNCTIONS (ฟังก์ชันเสริมช่วยจัดการงาน)
// ==========================================

/**
 * แปลงข้อมูลจากชีตให้เป็นรูปแบบ JSON อาร์เรย์ของวัตถุ
 */
function getSheetDataAsJson(sheet) {
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return []; // ไม่มีข้อมูล นอกจากหัวแถว
  
  var headers = data[0];
  var jsonResult = [];
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var obj = { rowNum: i + 1 };
    for (var j = 0; j < headers.length; j++) {
      var headerName = headers[j];
      var cellValue = row[j];
      
      var formattedValue = cellValue;
      if (cellValue instanceof Date) {
        formattedValue = cellValue.toISOString();
      }
      
      obj[headerName] = formattedValue;
      
      // เพิ่มความเข้ากันได้ระหว่างตัวพิมพ์ใหญ่-เล็กของชื่อฟิลด์กับฝั่งหน้าเว็บ
      if (headerName === "ID") obj["id"] = formattedValue;
      else if (headerName === "Status") obj["status"] = formattedValue;
      else if (headerName === "TeacherName") obj["teacherName"] = formattedValue;
      else if (headerName === "Department") obj["department"] = formattedValue;
      else if (headerName === "Subject") obj["subject"] = formattedValue;
      else if (headerName === "SubjectCode") obj["subjectCode"] = formattedValue;
      else if (headerName === "Date") obj["date"] = formattedValue;
      else if (headerName === "Time") obj["time"] = formattedValue;
      else if (headerName === "Period") obj["period"] = formattedValue;
      else if (headerName === "ClassRoom") obj["classRoom"] = formattedValue;
      else if (headerName === "PlanUrl") obj["planUrl"] = formattedValue;
      else if (headerName === "MediaUrl") obj["mediaUrl"] = formattedValue;
      else if (headerName === "Image1Url") obj["image1Url"] = formattedValue;
      else if (headerName === "Image2Url") obj["image2Url"] = formattedValue;
      else if (headerName === "Image3Url") obj["image3Url"] = formattedValue;
      else if (headerName === "Image4Url") obj["image4Url"] = formattedValue;
      else if (headerName === "ClipLink") obj["clipLink"] = formattedValue;
      else if (headerName === "AverageScore") obj["averageScore"] = formattedValue;
      else if (headerName === "Rating") obj["rating"] = formattedValue;
      else if (headerName === "Strengths") obj["strengths"] = formattedValue;
      else if (headerName === "Improvement") obj["improvement"] = formattedValue;
      else if (headerName === "Suggestions") obj["suggestions"] = formattedValue;
      else if (headerName === "ScoresJSON") obj["scores"] = formattedValue;
    }
    jsonResult.push(obj);
  }
  
  return jsonResult;
}

/**
 * ดึงอ็อบเจกต์โฟลเดอร์สำหรับเก็บไฟล์อัปโหลด
 */
function getUploadFolder() {
  var folder;
  if (DRIVE_FOLDER_ID && DRIVE_FOLDER_ID.trim() !== "") {
    try {
      folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    } catch (e) {
      console.warn("ไม่พบโฟลเดอร์จาก DRIVE_FOLDER_ID ที่ระบุ กำลังสร้างโฟลเดอร์ระบบใหม่ใน Google Drive...");
    }
  }
  
  if (!folder) {
    var folders = DriveApp.getFoldersByName("ระบบนิเทศภายใน_ไฟล์อัปโหลด");
    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = DriveApp.createFolder("ระบบนิเทศภายใน_ไฟล์อัปโหลด");
    }
  }
  
  return folder;
}

/**
 * ถอดรหัสและบันทึกไฟล์ Base64 ไปยัง Google Drive พร้อมคืนค่าเป็นลิงก์เปิดดูไฟล์ได้
 */
function uploadBase64FileToDrive(fileObj, parentFolder) {
  if (!fileObj || !fileObj.base64) return "";
  
  try {
    var parts = fileObj.base64.split(",");
    var contentType = parts[0].split(";")[0].split(":")[1];
    var base64Data = parts[1];
    var decodedBytes = Utilities.base64Decode(base64Data);
    
    // ตั้งชื่อไฟล์พร้อมระบุรหัสสุ่มปะหน้าเพื่อป้องกันซ้ำ
    var randomSuffix = new Date().getTime().toString().slice(-6);
    var cleanFilename = randomSuffix + "_" + fileObj.filename;
    
    var blob = Utilities.newBlob(decodedBytes, contentType, cleanFilename);
    var file = parentFolder.createFile(blob);
    
    // ตั้งสิทธิ์เข้าชมไฟล์แบบสาธารณะเพื่อให้เบราว์เซอร์สามารถดึงภาพและแผนไปเปิดได้โดยตรง
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      console.warn("ไม่สามารถตั้งสิทธิ์แชร์สาธารณะได้เนื่องจากนโยบายองค์กร/โดเมน: " + shareErr.toString());
      // พยายามแชร์เฉพาะภายในองค์กรที่มีลิงก์แทน (หากเป็น Google Workspace)
      try {
        file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (domainErr) {
        console.warn("ไม่สามารถตั้งสิทธิ์แชร์ในโดเมนได้เช่นกัน: " + domainErr.toString());
      }
    }
    
    return file.getUrl();
  } catch (err) {
    console.error("อัปโหลดไฟล์ไม่สำเร็จ: " + fileObj.filename + ", " + err.toString());
    logError("uploadBase64FileToDrive: " + (fileObj ? fileObj.filename : "unknown"), err);
    return "";
  }
}

/**
 * บันทึกข้อผิดพลาดลงในชีต SystemLogs เพื่อความสะดวกในการวิเคราะห์ปัญหา
 */
function logError(context, err) {
  try {
    var ss = getTargetSpreadsheet();
    var sheet = ss.getSheetByName("SystemLogs");
    if (!sheet) {
      sheet = ss.insertSheet("SystemLogs");
      sheet.appendRow(["Timestamp", "Context", "Error"]);
      sheet.getRange("A1:C1").setFontWeight("bold").setBackground("#FFCDD2");
    }
    sheet.appendRow([new Date(), context, err.toString()]);
  } catch (e) {
    console.error("ไม่สามารถบันทึก Log ได้: " + e.toString());
  }
}

/**
 * ดึงรายการบันทึกข้อผิดพลาด
 */
function getSystemLogs() {
  try {
    var ss = getTargetSpreadsheet();
    var sheet = ss.getSheetByName("SystemLogs");
    if (!sheet) return { status: "success", logs: [] };
    return { status: "success", logs: getSheetDataAsJson(sheet) };
  } catch (err) {
    return { status: "error", message: err.toString() };
  }
}
