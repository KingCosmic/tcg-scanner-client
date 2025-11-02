// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
// use image::GenericImageView;
// use tflite::{FlatBufferModel, InterpreterBuilder};
// use serde::Serialize;

// #[derive(Serialize)]
// struct BoundingBox {
//     points: Vec<[f32; 2]>,
//     confidence: f32,
//     class: String,
// }

// #[tauri::command]
// fn detect_card(image_bytes: Vec<u8>) -> Result<Vec<BoundingBox>, String> {
//     // Load image from JS
//     let img = image::load_from_memory(&image_bytes).map_err(|e| e.to_string())?;
//     let (width, height) = img.dimensions();

//     // Load model (cached globally in real-world usage)
//     let model = FlatBufferModel::build_from_file("model.tflite")
//         .map_err(|e| format!("Model load error: {:?}", e))?;
//     let builder = InterpreterBuilder::new(model, None).unwrap();
//     let mut interpreter = builder.build().unwrap();
//     interpreter.allocate_tensors().unwrap();

//     // Preprocess (resize + normalize)
//     let resized = img.resize_exact(640, 640, image::imageops::FilterType::Nearest);
//     let rgb = resized.to_rgb8();
//     let input = interpreter.input_tensor(0).unwrap();

//     let input_data: Vec<f32> = rgb
//         .pixels()
//         .flat_map(|p| p.0)
//         .map(|v| v as f32 / 255.0)
//         .collect();

//     input.copy_from_buffer(&input_data);

//     // Run inference
//     interpreter.invoke().unwrap();

//     // Retrieve outputs
//     let output = interpreter.output_tensor(0).unwrap();
//     let output_data: &[f32] = output.data::<f32>().unwrap();

//     // Example: assume each detection = [y1, x1, y2, x2, confidence]
//     let mut results = vec![];
//     for chunk in output_data.chunks(6) {
//         if chunk[4] < 0.3 { continue; } // confidence threshold
//         let bbox = BoundingBox {
//             points: vec![
//                 [chunk[1] * width as f32, chunk[0] * height as f32],
//                 [chunk[3] * width as f32, chunk[0] * height as f32],
//                 [chunk[3] * width as f32, chunk[2] * height as f32],
//                 [chunk[1] * width as f32, chunk[2] * height as f32],
//             ],
//             confidence: chunk[4],
//             class: "pokemon_card".into(),
//         };
//         results.push(bbox);
//     }

//     Ok(results)
// }


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
