//
//  TaskView.swift
//  chronos
//
//  Created by Prasanth Dendukuri on 2/13/25.
//

import Foundation
import SwiftUI
import CoreData

struct RoundedRectangleCheckboxStyle: ToggleStyle {
    @State private var isHovering = false
    
    func makeBody(configuration: Configuration) -> some View {
        HStack {
            ZStack {
                RoundedRectangle(cornerRadius: 6)
                    .stroke(Color.black, lineWidth: 1)
                    .frame(width: 16, height:15 )
                
                if configuration.isOn {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.gray)
                            .frame(width: 16, height: 16)
                }
                
                if configuration.isOn || isHovering {
                    Image(systemName: "checkmark")
                        .foregroundColor(configuration.isOn ? .white : .gray)
                        .font(.system(size: 12, weight: .bold))
                }
            }
            .onHover { hovering in
                isHovering = hovering
            }
            configuration.label
        }
        .onTapGesture {
            configuration.isOn.toggle()
        }
    }
}

struct TaskView: View {
    @State private var isChecked: Bool = false
    var text: String // Keep task text
    var onDelete: () -> Void // Closure to handle deletion

    var body: some View {
        VStack {
            Toggle(isOn: $isChecked) {
                Text(text)
                    .font(.body)
                    .foregroundColor(.black)
            }
            .toggleStyle(RoundedRectangleCheckboxStyle())
            .onChange(of: isChecked) { value in
                if value {
                    onDelete() // Call the passed closure when checkbox is checked
                }
            }
        }
        .padding(.vertical, 4)

    }

}

//#Preview {
//    TaskView(text: "babe")
//}
