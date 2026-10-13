/**
 * Standard Asset Template Configuration
 * This defines the strict fields and order for the Standard Import/Export layer.
 */
module.exports = {
  version: "v1",
  strictMode: false, // Set to true to disable legacy uploads
  
  fields: [
    { header: "Asset Name", key: "asset_name", required: true },
    { header: "Asset Description", key: "asset_description", required: false },
    { header: "Property ID", key: "property_id", required: true },
    { header: "Asset Code", key: "asset_code", required: false },
    { header: "Asset Type", key: "asset_type", required: false }, // OWNED, LEASED, etc.
    { header: "Asset Category ID", key: "category_id", required: true },
    { header: "Asset Sub Category ID", key: "sub_category_id", required: false },
    { header: "Department ID", key: "department_id", required: true },
    { header: "User First Name", key: "first_name", required: false },
    { header: "User Last Name", key: "last_name", required: false },
    { header: "State ID", key: "state_id", required: false },
    { header: "City ID", key: "city_id", required: false },
    { header: "Make", key: "make", required: false },
    { header: "Quantity", key: "quantity", required: false },
    { header: "Location ID", key: "location_id", required: true },
    { header: "Brand", key: "brand", required: false },
    { header: "Model", key: "model", required: false },
    { header: "Serial No", key: "serial_no", required: false },
    { header: "Purchase Order No", key: "purchase_order_no", required: false },
    { header: "Purchase Date", key: "purchase_date", required: false },
    { header: "Sub Dept ID", key: "sub_department_id", required: false },
    { header: "Note", key: "remarks", required: false },
    { header: "Supplier ID", key: "vendor_id", required: false },
    { header: "Invoice Number", key: "invoice_number", required: false },
    { header: "Purchase Price", key: "purchase_cost", required: true },
    { header: "GST", key: "gst_charges", required: false },
    { header: "Total Price", key: "total_cost", required: false },
    { header: "Opening Accumulated Depreciation", key: "accumulated_depreciation_opening", required: false } // migrated/legacy assets: depreciation already charged up to cutover
  ]
};
