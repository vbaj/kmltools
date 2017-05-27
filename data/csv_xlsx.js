// Commandline utility to convert from Excel format to CSV and vise versa
// Usage: WScript.exe csv_xlsx.js /csv <Excel-file-path>
// Usage: WScript.exe csv_xlsx.js /xl <CSV-file-path>

var args     = WScript.Arguments;
var exitCode = null;

ExcelToCSV = function(sPath){
    try{ var oXls = new ActiveXObject("Excel.Application");
    } catch(e){
        WScript.Echo("Error creating Excel.Application ActiveX Object.\n" +
            "Please make sure Microsoft Excel is installed on the machine.");
        return false;
    }
    try{ var oWbk = oXls.Workbooks.Open(sPath, null, true);
    } catch(e){
        WScript.Echo("Error opening Workbook '" + sPath + "'.\n" +
            "Please make sure the file exists and it is not open in EXCLUSIVE mode.");
        oXls = null;
        return false;
    }
    try{ var oSht = oWbk.Sheets(1); // Refer to first sheet of the Excel workbook.
    } catch(e){
        WScript.Echo("Error opening first sheet of workbook '" + sPath + "'");
        oWbk.Close()
        oWbk = oXls = null;
        return false;
    }
    oSht.SaveAs(sPath + ".csv", 6); // Save CSV file from Excel.
    oWbk.Close(false); // Save and don't prompt to use CSV format while closing.
    oXls.Quit(); // Close Excel.Application object.
    oSht = oWbk = oXls = null; // Cleanup references.
    return true;
}

CSVToExcel = function(sPath){    // Open CSV and save as Excel file.
    try{ var oXls = new ActiveXObject("Excel.Application");
    } catch(e){
        WScrpt.Echo("Error creating Excel.Application ActiveX Object.");
        return false;
    }
    oXls.DisplayAlerts = false; // Make Excel silent for prompt using CSV format.
    try{ var oWbk = oXls.Workbooks.Open(sPath, null, false, 2); // Open csv in Excel.
    } catch(e){
        WScrpt.Echo("Error opening workbook from '" + sPath + "'.");
        oXls.Quit();
        oWbk = oXls = null;
        return false;
    }
    // Save Excel file in xlOpenXMLWorkbook format : Office 2007 needs testing.
    try{ oWbk.Sheets(1).SaveAs(sPath.replace(/\.csv$/i, ".xlsx"), 51);
    } catch(e){
        WScrpt.Echo("Error saving CSV to Excel file '" + sPath + ".xlsx'.");
        oXls.Quit();
        oWbk = oXls = null;
        return null;
    }
    oWbk.Close(false);
    oXls.Quit();
    oWbk = oXls = null;
    return true;
}

if(args.length < 2){
    WScript.Echo("Incorrect usage!");
} else {
    switch(args.Item(0)){
        case "/csv": exitCode = ExcelToCSV(args.Item(1)); if(!exitCode) WScript.Quit(1); break;
        case "/xl" : exitCode = CSVToExcel(args.Item(1)); if(!exitCode) WScript.Quit(1); break;
        default    : WScript.Echo("Incorrect Commandline!"); WScript.Quit(1);
    }
}
